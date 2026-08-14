use std::{
    collections::HashMap,
    env, fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const MAX_PROMPT_BYTES: usize = 750_000;
const MAX_OUTPUT_BYTES: u64 = 2 * 1024 * 1024;
const CLI_TIMEOUT: Duration = Duration::from_secs(180);
const MAX_CONCURRENT_REQUESTS: usize = 2;

#[derive(Default)]
pub struct AssistantCliManager {
    requests: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssistantCliProvider {
    Openai,
    Anthropic,
}

impl AssistantCliProvider {
    fn executable(self) -> &'static str {
        match self {
            Self::Openai => "codex",
            Self::Anthropic => "claude",
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::Openai => "openai",
            Self::Anthropic => "anthropic",
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantCliStatus {
    provider: &'static str,
    installed: bool,
    authenticated: bool,
    version: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAssistantCliRequest {
    request_id: String,
    provider: AssistantCliProvider,
    prompt: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantCliResponse {
    content: String,
    provider: &'static str,
}

fn home_dir() -> Option<PathBuf> {
    env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}

fn executable_names(name: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![
            format!("{name}.exe"),
            format!("{name}.cmd"),
            format!("{name}.bat"),
        ]
    } else {
        vec![name.to_owned()]
    }
}

fn candidate_directories() -> Vec<PathBuf> {
    let mut directories = Vec::new();
    if let Some(path) = env::var_os("PATH") {
        directories.extend(env::split_paths(&path).filter(|entry| entry.is_absolute()));
    }
    if let Some(home) = home_dir() {
        directories.extend([
            home.join(".local/bin"),
            home.join(".bun/bin"),
            home.join(".npm-global/bin"),
            home.join(".cargo/bin"),
        ]);
        if cfg!(target_os = "windows") {
            directories.extend([
                home.join("AppData/Roaming/npm"),
                home.join("AppData/Local/Programs"),
            ]);
        }
    }
    if cfg!(target_os = "macos") {
        directories.extend([
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
        ]);
    } else if cfg!(target_os = "linux") {
        directories.extend([PathBuf::from("/usr/local/bin"), PathBuf::from("/usr/bin")]);
    }
    directories
}

fn find_executable(provider: AssistantCliProvider) -> Option<PathBuf> {
    for directory in candidate_directories() {
        for name in executable_names(provider.executable()) {
            let candidate = directory.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn sanitized_line(bytes: &[u8]) -> Option<String> {
    let value = String::from_utf8_lossy(bytes)
        .lines()
        .next()
        .unwrap_or_default()
        .trim()
        .chars()
        .take(120)
        .collect::<String>();
    (!value.is_empty()).then_some(value)
}

fn command_output(path: &Path, args: &[&str]) -> Option<std::process::Output> {
    Command::new(path)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .ok()
}

fn is_authenticated(provider: AssistantCliProvider, path: &Path) -> bool {
    match provider {
        AssistantCliProvider::Openai => {
            command_output(path, &["login", "status"]).is_some_and(|output| output.status.success())
        }
        AssistantCliProvider::Anthropic => command_output(path, &["auth", "status", "--json"])
            .filter(|output| output.status.success())
            .and_then(|output| serde_json::from_slice::<serde_json::Value>(&output.stdout).ok())
            .and_then(|value| value.get("loggedIn").and_then(serde_json::Value::as_bool))
            .unwrap_or(false),
    }
}

fn status_for(provider: AssistantCliProvider) -> AssistantCliStatus {
    let Some(path) = find_executable(provider) else {
        return AssistantCliStatus {
            provider: provider.id(),
            installed: false,
            authenticated: false,
            version: None,
        };
    };
    let version = command_output(&path, &["--version"]).and_then(|output| {
        sanitized_line(&output.stdout).or_else(|| sanitized_line(&output.stderr))
    });
    AssistantCliStatus {
        provider: provider.id(),
        installed: true,
        authenticated: is_authenticated(provider, &path),
        version,
    }
}

#[tauri::command]
pub async fn detect_assistant_clis() -> Result<Vec<AssistantCliStatus>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        vec![
            status_for(AssistantCliProvider::Openai),
            status_for(AssistantCliProvider::Anthropic),
        ]
    })
    .await
    .map_err(|error| format!("Failed to inspect provider CLIs: {error}"))
}

fn cli_command(
    provider: AssistantCliProvider,
    executable: &Path,
    working_directory: &Path,
) -> Command {
    let mut command = Command::new(executable);
    command
        .current_dir(working_directory)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env_remove("OPENAI_API_KEY")
        .env_remove("CODEX_API_KEY")
        .env_remove("ANTHROPIC_API_KEY");
    match provider {
        AssistantCliProvider::Openai => {
            command.args([
                "exec",
                "--ephemeral",
                "--ignore-user-config",
                "--ignore-rules",
                "--sandbox",
                "read-only",
                "--skip-git-repo-check",
                "--color",
                "never",
                "-",
            ]);
        }
        AssistantCliProvider::Anthropic => {
            command.args([
                "--print",
                "--safe-mode",
                "--no-session-persistence",
                "--tools",
                "",
                "--output-format",
                "json",
            ]);
        }
    }
    command
}

fn parse_cli_response(provider: AssistantCliProvider, stdout: &[u8]) -> Result<String, String> {
    match provider {
        AssistantCliProvider::Openai => {
            let text = String::from_utf8_lossy(stdout).trim().to_owned();
            if text.is_empty() {
                Err("Codex CLI returned an empty response.".to_owned())
            } else {
                Ok(text)
            }
        }
        AssistantCliProvider::Anthropic => {
            let value: serde_json::Value = serde_json::from_slice(stdout)
                .map_err(|_| "Claude CLI returned an invalid response.".to_owned())?;
            value
                .get("result")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|result| !result.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| "Claude CLI returned an empty response.".to_owned())
        }
    }
}

fn run_cli_blocking(
    provider: AssistantCliProvider,
    executable: PathBuf,
    working_directory: PathBuf,
    prompt: String,
    cancelled: Arc<AtomicBool>,
) -> Result<String, String> {
    let mut child = cli_command(provider, &executable, &working_directory)
        .spawn()
        .map_err(|error| format!("Could not start {} CLI: {error}", provider.executable()))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| format!("{} CLI input was unavailable.", provider.executable()))?;
    let prompt_writer =
        thread::spawn(move || std::io::Write::write_all(&mut stdin, prompt.as_bytes()));
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("{} CLI output was unavailable.", provider.executable()))?;
    let stderr = child.stderr.take().ok_or_else(|| {
        format!(
            "{} CLI error output was unavailable.",
            provider.executable()
        )
    })?;
    let stdout_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(MAX_OUTPUT_BYTES + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let stderr_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stderr
            .take(MAX_OUTPUT_BYTES + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });

    let started = Instant::now();
    let exit_status = loop {
        if cancelled.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Cancelled.".to_owned());
        }
        if started.elapsed() >= CLI_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("{} CLI timed out.", provider.executable()));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(error) => return Err(format!("{} CLI failed: {error}", provider.executable())),
        }
    };

    prompt_writer
        .join()
        .map_err(|_| format!("{} CLI input failed.", provider.executable()))?
        .map_err(|error| format!("{} CLI input failed: {error}", provider.executable()))?;
    let stdout = stdout_reader
        .join()
        .map_err(|_| format!("{} CLI output failed.", provider.executable()))?
        .map_err(|error| format!("{} CLI output failed: {error}", provider.executable()))?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| format!("{} CLI error output failed.", provider.executable()))?
        .map_err(|error| format!("{} CLI error output failed: {error}", provider.executable()))?;
    if stdout.len() as u64 > MAX_OUTPUT_BYTES || stderr.len() as u64 > MAX_OUTPUT_BYTES {
        return Err(format!(
            "{} CLI response was too large.",
            provider.executable()
        ));
    }
    if !exit_status.success() {
        let detail =
            sanitized_line(&stderr).unwrap_or_else(|| "provider command failed".to_owned());
        return Err(format!("{} CLI: {detail}", provider.executable()));
    }
    parse_cli_response(provider, &stdout)
}

#[tauri::command]
pub async fn run_assistant_cli(
    app: AppHandle,
    state: tauri::State<'_, AssistantCliManager>,
    request: RunAssistantCliRequest,
) -> Result<AssistantCliResponse, String> {
    if request.request_id.is_empty()
        || request.request_id.len() > 80
        || !request
            .request_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("Assistant CLI request id is invalid.".to_owned());
    }
    if request.prompt.trim().is_empty() || request.prompt.len() > MAX_PROMPT_BYTES {
        return Err("Assistant CLI prompt is empty or too large.".to_owned());
    }
    let executable = find_executable(request.provider)
        .ok_or_else(|| format!("{} CLI is not installed.", request.provider.executable()))?;
    if !is_authenticated(request.provider, &executable) {
        return Err(format!(
            "{} CLI is not signed in. Authenticate in your terminal first.",
            request.provider.executable()
        ));
    }
    let working_directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Assistant CLI cache is unavailable: {error}"))?
        .join("assistant-cli");
    fs::create_dir_all(&working_directory)
        .map_err(|error| format!("Assistant CLI cache could not be prepared: {error}"))?;

    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut requests = state
            .requests
            .lock()
            .map_err(|_| "Assistant CLI request state is unavailable.".to_owned())?;
        if requests.len() >= MAX_CONCURRENT_REQUESTS {
            return Err("Too many local assistant requests are running.".to_owned());
        }
        if requests.contains_key(&request.request_id) {
            return Err("Assistant CLI request is already running.".to_owned());
        }
        requests.insert(request.request_id.clone(), cancelled.clone());
    }

    let provider = request.provider;
    let request_id = request.request_id;
    let result = tauri::async_runtime::spawn_blocking(move || {
        run_cli_blocking(
            provider,
            executable,
            working_directory,
            request.prompt,
            cancelled,
        )
    })
    .await
    .map_err(|error| format!("Assistant CLI task failed: {error}"))
    .and_then(|result| result);

    if let Ok(mut requests) = state.requests.lock() {
        requests.remove(&request_id);
    }
    result.map(|content| AssistantCliResponse {
        content,
        provider: provider.id(),
    })
}

#[tauri::command]
pub fn cancel_assistant_cli(
    state: tauri::State<'_, AssistantCliManager>,
    request_id: String,
) -> Result<(), String> {
    let requests = state
        .requests
        .lock()
        .map_err(|_| "Assistant CLI request state is unavailable.".to_owned())?;
    if let Some(cancelled) = requests.get(&request_id) {
        cancelled.store(true, Ordering::Relaxed);
    }
    Ok(())
}
