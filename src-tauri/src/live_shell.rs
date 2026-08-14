//! Live desktop UI shell.
//!
//! Packaged builds embed a UI bundle at compile time. Without this module that bundle is frozen
//! for the lifetime of the installation, so every web release leaves installed desktop copies
//! behind until the user installs a whole new native package.
//!
//! The deployed web application publishes the same desktop UI under `/desktop-shell/`, described
//! by `/desktop-shell/shell.json`. This module downloads that shell into application data,
//! verifies every file against its manifest digest, and activates it atomically. The local
//! loopback server then serves the downloaded shell instead of the embedded one, so an installed
//! desktop application renders exactly the UI the web deployment is running.
//!
//! Guarantees intentionally preserved here:
//! - Files are only ever fetched from the compile-time backend origin.
//! - A shell activates only after every declared file downloads and matches its SHA-256 digest.
//! - A shell declaring a `minimumNativeVersion` above this binary is refused, so a UI can never
//!   run against a native host that lacks the commands it needs.
//! - The previously active shell stays readable until the window reloads, so chunks requested by
//!   an already-rendered page keep resolving after an activation.
//! - Any failure falls back to the embedded bundle, which keeps the application usable offline.
//!
//! Development builds load the UI from the Vite server instead of the loopback asset server, so
//! serving and background synchronization are compiled out there.

#![cfg_attr(debug_assertions, allow(dead_code))]

use std::{
    collections::BTreeSet,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, RwLock},
    thread,
    time::Duration,
};

use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, AssetResolver, Emitter, Manager, Wry};

/// Emitted to the webview after a newer shell becomes active. The UI offers a reload.
pub const SHELL_UPDATED_EVENT: &str = "millennium://shell-updated";

/// URL path encoding set, matching the WHATWG path percent-encode set.
const URL_PATH_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'`')
    .add(b'{')
    .add(b'}')
    .add(b'%');

const DEFAULT_BACKEND_ORIGIN: &str = "http://millennium-five.vercel.app";
const SHELL_DIRECTORY: &str = "shell";
const ACTIVE_POINTER_FILE: &str = "active.json";
const MANIFEST_FILENAME: &str = "shell.json";
const REMOTE_SHELL_PREFIX: &str = "desktop-shell";
const MAX_MANIFEST_BYTES: u64 = 512 * 1024;
const MAX_SHELL_FILES: usize = 600;
const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_SHELL_BYTES: u64 = 96 * 1024 * 1024;
const CHECK_INTERVAL: Duration = Duration::from_secs(30 * 60);
/// Used after a failed check. The first check runs seconds after launch, which is often before the
/// network is usable, and waiting a full interval left the shell stale for half an hour.
const RETRY_INTERVAL: Duration = Duration::from_secs(5 * 60);
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(4);

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShellManifestFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredManifest {
    build_id: String,
    version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShellManifest {
    build_id: String,
    version: String,
    #[serde(default)]
    minimum_native_version: Option<String>,
    files: Vec<ShellManifestFile>,
}

/// Status surfaced to the UI so it can explain which shell is running and why.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellStatus {
    /// `live` when a downloaded shell is active, `bundled` when the embedded UI is serving.
    pub channel: &'static str,
    pub build_id: Option<String>,
    pub version: Option<String>,
    pub native_version: String,
    /// True when the deployed shell requires a newer native package than this installation.
    pub requires_native_update: bool,
    /// Version of the shell that could not be activated because the native host is too old.
    pub blocked_version: Option<String>,
    pub last_checked_at: Option<String>,
    pub last_error: Option<String>,
}

struct CachedShell {
    build_id: String,
    version: String,
    directory: PathBuf,
    /// Resolved once at construction. Every asset request used to canonicalize the shell root as
    /// well as the file, which is two filesystem walks per chunk on a cold page load.
    canonical_root: PathBuf,
}

impl CachedShell {
    fn new(build_id: String, version: String, directory: PathBuf) -> Self {
        let canonical_root = directory.canonicalize().unwrap_or_else(|_| directory.clone());
        Self {
            build_id,
            version,
            directory,
            canonical_root,
        }
    }

    fn read(&self, relative_path: &str) -> Option<Vec<u8>> {
        let candidate = self.directory.join(relative_path);
        // `relative_path` is validated before it reaches here, but re-check containment so a
        // symlink or unexpected component can never escape the shell directory.
        let canonical_file = candidate.canonicalize().ok()?;
        if !canonical_file.starts_with(&self.canonical_root) {
            return None;
        }
        fs::read(canonical_file).ok()
    }
}

#[derive(Default)]
struct ShellState {
    active: Option<Arc<CachedShell>>,
    previous: Option<Arc<CachedShell>>,
}

struct ShellDiagnostics {
    last_checked_at: Option<String>,
    last_error: Option<String>,
    blocked_version: Option<String>,
}

pub struct LiveShell {
    resolver: AssetResolver<Wry>,
    root: PathBuf,
    client: Client,
    backend_origin: String,
    native_version: String,
    state: RwLock<ShellState>,
    diagnostics: Mutex<ShellDiagnostics>,
}

/// One resolved asset, from either the downloaded shell or the embedded bundle.
pub struct ShellAsset {
    pub bytes: Vec<u8>,
    pub mime_type: String,
    pub csp_header: Option<String>,
}

impl LiveShell {
    pub fn new(app: &AppHandle, backend_origin: &str) -> Arc<Self> {
        let root = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(SHELL_DIRECTORY);
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(60))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap_or_else(|_| Client::new());

        let shell = Arc::new(Self {
            resolver: app.asset_resolver(),
            root,
            client,
            backend_origin: backend_origin.trim_end_matches('/').to_owned(),
            native_version: app.package_info().version.to_string(),
            state: RwLock::new(ShellState::default()),
            diagnostics: Mutex::new(ShellDiagnostics {
                last_checked_at: None,
                last_error: None,
                blocked_version: None,
            }),
        });
        shell.restore_active_shell();
        shell
    }

    /// Serves an asset from the active shell, then the shell replaced during this session, then
    /// the embedded bundle. The layered lookup keeps an already-rendered page working after an
    /// activation swaps directories underneath it.
    pub fn resolve(&self, relative_path: &str) -> Option<ShellAsset> {
        if is_valid_shell_path(relative_path) {
            let (active, previous) = {
                let state = self.state.read().ok()?;
                (state.active.clone(), state.previous.clone())
            };
            for shell in [active, previous].into_iter().flatten() {
                if let Some(bytes) = shell.read(relative_path) {
                    return Some(ShellAsset {
                        mime_type: mime_type_for(relative_path).to_owned(),
                        csp_header: None,
                        bytes,
                    });
                }
            }
        }

        let asset = self.resolver.get(relative_path.to_owned())?;
        Some(ShellAsset {
            mime_type: asset.mime_type().to_owned(),
            csp_header: asset.csp_header.clone(),
            bytes: asset.bytes().to_vec(),
        })
    }

    pub fn status(&self) -> ShellStatus {
        let active = self.state.read().ok().and_then(|state| state.active.clone());
        let diagnostics = self.diagnostics.lock().ok();
        let (last_checked_at, last_error, blocked_version) = diagnostics
            .map(|diagnostics| {
                (
                    diagnostics.last_checked_at.clone(),
                    diagnostics.last_error.clone(),
                    diagnostics.blocked_version.clone(),
                )
            })
            .unwrap_or((None, None, None));

        ShellStatus {
            channel: if active.is_some() { "live" } else { "bundled" },
            build_id: active.as_ref().map(|shell| shell.build_id.clone()),
            version: active.as_ref().map(|shell| shell.version.clone()),
            native_version: self.native_version.clone(),
            requires_native_update: blocked_version.is_some(),
            blocked_version,
            last_checked_at,
            last_error,
        }
    }

    /// Downloads and activates the deployed shell when it differs from the active one.
    /// Returns `true` when a new shell became active.
    pub fn synchronize(&self, app: &AppHandle) -> Result<bool, String> {
        let result = self.synchronize_inner();
        if let Ok(mut diagnostics) = self.diagnostics.lock() {
            diagnostics.last_checked_at = Some(now_rfc3339());
            diagnostics.last_error = result.as_ref().err().cloned();
        }
        let activated = result?;
        if activated {
            let _ = app.emit(SHELL_UPDATED_EVENT, self.status());
        }
        Ok(activated)
    }

    fn synchronize_inner(&self) -> Result<bool, String> {
        let manifest = self.fetch_manifest()?;

        if let Some(minimum) = manifest.minimum_native_version.as_deref() {
            if !version_at_least(&self.native_version, minimum) {
                if let Ok(mut diagnostics) = self.diagnostics.lock() {
                    diagnostics.blocked_version = Some(manifest.version.clone());
                }
                return Err(format!(
                    "Deployed shell {} requires desktop {minimum} or newer.",
                    manifest.version
                ));
            }
        }
        if let Ok(mut diagnostics) = self.diagnostics.lock() {
            diagnostics.blocked_version = None;
        }

        let already_active = self
            .state
            .read()
            .ok()
            .and_then(|state| state.active.as_ref().map(|shell| shell.build_id.clone()))
            .is_some_and(|build_id| build_id == manifest.build_id);
        if already_active {
            return Ok(false);
        }

        let directory = self.download_shell(&manifest)?;
        self.activate(CachedShell::new(
            manifest.build_id.clone(),
            manifest.version.clone(),
            directory,
        ))?;
        self.prune_unused_shells();
        Ok(true)
    }

    fn fetch_manifest(&self) -> Result<ShellManifest, String> {
        let url = format!(
            "{}/{REMOTE_SHELL_PREFIX}/{MANIFEST_FILENAME}",
            self.backend_origin
        );
        let response = self
            .client
            .get(url)
            .header("accept", "application/json")
            .header("cache-control", "no-cache")
            .timeout(Duration::from_secs(10))
            .send()
            .map_err(|error| format!("Shell manifest request failed: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Shell manifest responded with status {}.",
                response.status().as_u16()
            ));
        }

        let mut body = Vec::new();
        response
            .take(MAX_MANIFEST_BYTES + 1)
            .read_to_end(&mut body)
            .map_err(|error| format!("Shell manifest could not be read: {error}"))?;
        if body.len() as u64 > MAX_MANIFEST_BYTES {
            return Err("Shell manifest is too large.".to_owned());
        }

        let manifest: ShellManifest = serde_json::from_slice(&body)
            .map_err(|error| format!("Shell manifest is not valid: {error}"))?;
        validate_manifest(&manifest)?;
        Ok(manifest)
    }

    fn download_shell(&self, manifest: &ShellManifest) -> Result<PathBuf, String> {
        let staging = self.root.join(format!("staging-{}", manifest.build_id));
        let target = self.root.join(&manifest.build_id);
        let _ = fs::remove_dir_all(&staging);
        fs::create_dir_all(&staging)
            .map_err(|error| format!("Shell staging directory failed: {error}"))?;

        let download = (|| -> Result<(), String> {
            for file in &manifest.files {
                let bytes = match self.reuse_downloaded_file(file) {
                    Some(bytes) => bytes,
                    None => self.download_file(file)?,
                };
                let destination = staging.join(&file.path);
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("Shell directory failed: {error}"))?;
                }
                fs::write(&destination, &bytes)
                    .map_err(|error| format!("Shell file {} failed to save: {error}", file.path))?;
            }
            fs::write(
                staging.join(MANIFEST_FILENAME),
                serde_json::to_vec(&StoredManifest {
                    build_id: manifest.build_id.clone(),
                    version: manifest.version.clone(),
                })
                .map_err(|error| format!("Shell manifest could not be stored: {error}"))?,
            )
            .map_err(|error| format!("Shell manifest could not be stored: {error}"))
        })();

        if let Err(error) = download {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }

        let _ = fs::remove_dir_all(&target);
        fs::rename(&staging, &target).map_err(|error| {
            let _ = fs::remove_dir_all(&staging);
            format!("Shell activation failed: {error}")
        })?;
        Ok(target)
    }

    /// Returns a file already on disk when it matches the manifest exactly. Most of a shell is
    /// unchanged between releases, so refetching every asset made each update download the whole
    /// bundle. A reused file still has to satisfy the same size and digest checks as a downloaded
    /// one, so the activation guarantee is unchanged.
    fn reuse_downloaded_file(&self, file: &ShellManifestFile) -> Option<Vec<u8>> {
        let (active, previous) = {
            let state = self.state.read().ok()?;
            (state.active.clone(), state.previous.clone())
        };
        let expected_digest = file.sha256.to_ascii_lowercase();
        for shell in [active, previous].into_iter().flatten() {
            let Some(bytes) = shell.read(&file.path) else {
                continue;
            };
            if bytes.len() as u64 == file.size && hex_digest(&bytes) == expected_digest {
                return Some(bytes);
            }
        }
        None
    }

    fn download_file(&self, file: &ShellManifestFile) -> Result<Vec<u8>, String> {
        // Published asset names may contain spaces, which are valid on disk but not in a URL path.
        let encoded_path = utf8_percent_encode(&file.path, URL_PATH_ENCODE_SET).to_string();
        let url = format!("{}/{REMOTE_SHELL_PREFIX}/{encoded_path}", self.backend_origin);
        let response = self
            .client
            .get(url)
            .header("cache-control", "no-cache")
            .send()
            .map_err(|error| format!("Shell file {} request failed: {error}", file.path))?;
        if !response.status().is_success() {
            return Err(format!(
                "Shell file {} responded with status {}.",
                file.path,
                response.status().as_u16()
            ));
        }

        let mut bytes = Vec::with_capacity(file.size.min(MAX_FILE_BYTES) as usize);
        response
            .take(MAX_FILE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Shell file {} could not be read: {error}", file.path))?;
        if bytes.len() as u64 != file.size {
            return Err(format!("Shell file {} has an unexpected size.", file.path));
        }
        if hex_digest(&bytes) != file.sha256.to_ascii_lowercase() {
            return Err(format!("Shell file {} failed digest verification.", file.path));
        }
        Ok(bytes)
    }

    fn activate(&self, shell: CachedShell) -> Result<(), String> {
        fs::create_dir_all(&self.root)
            .map_err(|error| format!("Shell root directory failed: {error}"))?;
        fs::write(
            self.root.join(ACTIVE_POINTER_FILE),
            serde_json::to_vec(&StoredManifest {
                build_id: shell.build_id.clone(),
                version: shell.version.clone(),
            })
            .map_err(|error| format!("Shell pointer could not be written: {error}"))?,
        )
        .map_err(|error| format!("Shell pointer could not be written: {error}"))?;

        let mut state = self
            .state
            .write()
            .map_err(|_| "Shell state is unavailable.".to_owned())?;
        state.previous = state.active.take();
        state.active = Some(Arc::new(shell));
        Ok(())
    }

    fn restore_active_shell(&self) {
        let Ok(pointer) = fs::read(self.root.join(ACTIVE_POINTER_FILE)) else {
            return;
        };
        let Ok(stored) = serde_json::from_slice::<StoredManifest>(&pointer) else {
            return;
        };
        if !is_valid_build_id(&stored.build_id) {
            return;
        }
        let directory = self.root.join(&stored.build_id);
        if !directory.join("index.html").is_file() {
            return;
        }
        if let Ok(mut state) = self.state.write() {
            state.active = Some(Arc::new(CachedShell::new(
                stored.build_id,
                stored.version,
                directory,
            )));
        }
    }

    /// Removes shell directories that are neither active nor the one replaced this session.
    fn prune_unused_shells(&self) {
        let keep = self
            .state
            .read()
            .ok()
            .map(|state| {
                [state.active.as_ref(), state.previous.as_ref()]
                    .into_iter()
                    .flatten()
                    .map(|shell| shell.build_id.clone())
                    .collect::<BTreeSet<_>>()
            })
            .unwrap_or_default();

        let Ok(entries) = fs::read_dir(&self.root) else {
            return;
        };
        for entry in entries.flatten() {
            if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if keep.contains(&name) {
                continue;
            }
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

/// Origin of the Millennium web deployment this package talks to. Selected at compile time so a
/// packaged application can never be redirected at another backend after shipping.
pub fn backend_origin() -> &'static str {
    option_env!("MILLENNIUM_DESKTOP_BACKEND_ORIGIN").unwrap_or(DEFAULT_BACKEND_ORIGIN)
}

#[tauri::command]
pub fn desktop_shell_status(shell: tauri::State<'_, Arc<LiveShell>>) -> ShellStatus {
    shell.status()
}

#[tauri::command]
pub async fn desktop_shell_check(
    app: AppHandle,
    shell: tauri::State<'_, Arc<LiveShell>>,
) -> Result<ShellStatus, String> {
    let shell = Arc::clone(&shell);
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _ = shell.synchronize(&handle);
        shell.status()
    })
    .await
    .map_err(|error| format!("Shell check failed: {error}"))
}

/// Starts background synchronization: once shortly after launch, then on a fixed interval.
pub fn spawn_synchronization(app: AppHandle, shell: Arc<LiveShell>) {
    thread::Builder::new()
        .name("millennium-live-shell".to_owned())
        .spawn(move || {
            thread::sleep(FIRST_CHECK_DELAY);
            loop {
                // A shell held back by `minimumNativeVersion` is not a transient failure — it
                // stays refused until the user installs a newer package — so only retry quickly
                // when the check itself failed.
                let interval = match shell.synchronize(&app) {
                    Ok(_) => CHECK_INTERVAL,
                    Err(_) if shell.status().requires_native_update => CHECK_INTERVAL,
                    Err(_) => RETRY_INTERVAL,
                };
                thread::sleep(interval);
            }
        })
        .ok();
}

fn validate_manifest(manifest: &ShellManifest) -> Result<(), String> {
    if !is_valid_build_id(&manifest.build_id) {
        return Err("Shell manifest declares an invalid build id.".to_owned());
    }
    if manifest.files.is_empty() || manifest.files.len() > MAX_SHELL_FILES {
        return Err("Shell manifest declares an unusable file count.".to_owned());
    }
    if !manifest
        .files
        .iter()
        .any(|file| file.path == "index.html")
    {
        return Err("Shell manifest does not declare an entry document.".to_owned());
    }

    let mut total = 0_u64;
    let mut seen = BTreeSet::new();
    for file in &manifest.files {
        if !is_valid_shell_path(&file.path) {
            return Err(format!("Shell manifest declares an unsafe path: {}", file.path));
        }
        if !seen.insert(file.path.as_str()) {
            return Err(format!("Shell manifest repeats path {}.", file.path));
        }
        if file.sha256.len() != 64 || !file.sha256.chars().all(|value| value.is_ascii_hexdigit()) {
            return Err(format!("Shell manifest digest for {} is invalid.", file.path));
        }
        if file.size > MAX_FILE_BYTES {
            return Err(format!("Shell file {} exceeds the size limit.", file.path));
        }
        total = total.saturating_add(file.size);
    }
    if total > MAX_SHELL_BYTES {
        return Err("Shell manifest exceeds the total size limit.".to_owned());
    }
    Ok(())
}

fn is_valid_build_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.chars().all(|value| value.is_ascii_alphanumeric())
}

fn is_valid_shell_path(value: &str) -> bool {
    if value.is_empty() || value.len() > 512 || value.starts_with('/') || value.contains('\\') {
        return false;
    }
    value.split('/').all(|segment| {
        !segment.is_empty()
            && segment != "."
            && segment != ".."
            && segment
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "._-@ ".contains(character))
    })
}

fn hex_digest(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let digest = Sha256::digest(bytes);
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        encoded.push(HEX[usize::from(byte >> 4)] as char);
        encoded.push(HEX[usize::from(byte & 0x0f)] as char);
    }
    encoded
}

/// Compares dotted numeric versions, ignoring any pre-release or build suffix.
fn version_at_least(current: &str, required: &str) -> bool {
    let parse = |value: &str| -> Vec<u64> {
        value
            .split(['-', '+'])
            .next()
            .unwrap_or_default()
            .split('.')
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect()
    };
    let current = parse(current);
    let required = parse(required);
    for index in 0..current.len().max(required.len()) {
        let left = current.get(index).copied().unwrap_or(0);
        let right = required.get(index).copied().unwrap_or(0);
        if left != right {
            return left > right;
        }
    }
    true
}

fn mime_type_for(path: &str) -> &'static str {
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "html" => "text/html",
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "wasm" => "application/wasm",
        "txt" => "text/plain",
        "webmanifest" => "application/manifest+json",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::{is_valid_shell_path, version_at_least};

    #[test]
    fn rejects_escaping_shell_paths() {
        assert!(is_valid_shell_path("_app-assets/index-a1b2.js"));
        assert!(is_valid_shell_path("Assets/Millennium Logo.png"));
        assert!(!is_valid_shell_path("_app-assets/%2e%2e/escape.js"));
        assert!(!is_valid_shell_path("../secrets"));
        assert!(!is_valid_shell_path("/etc/passwd"));
        assert!(!is_valid_shell_path("assets\\windows.js"));
    }

    #[test]
    fn compares_dotted_versions() {
        assert!(version_at_least("1.0.7", "1.0.7"));
        assert!(version_at_least("1.1.0", "1.0.9"));
        assert!(!version_at_least("1.0.6", "1.0.7"));
    }
}
