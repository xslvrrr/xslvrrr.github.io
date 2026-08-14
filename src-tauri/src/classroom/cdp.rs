use std::{
    fs,
    io::Read,
    net::TcpStream,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

use reqwest::{blocking::Client, Url};
use serde::Deserialize;
use serde_json::{json, Value};
use tungstenite::{connect, stream::MaybeTlsStream, Message, WebSocket};

use super::models::{ClassroomCommandError, ExtractedPage};

const CLASSROOM_URL: &str = "https://classroom.google.com/";
const EXTRACTOR_SCRIPT: &str = include_str!("extractor_v1.js");
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
const NAVIGATION_TIMEOUT: Duration = Duration::from_secs(30);
/// Socket read budget for one debugging command. The extractor waits for Classroom to render
/// before it reads, and a quiet page emits no events while it does, so this has to outlast that
/// wait or a healthy extraction is reported as a dropped connection.
const CDP_TIMEOUT: Duration = Duration::from_secs(30);
/// Settle time after the requested page reports a usable `readyState`. Classroom mounts its list
/// well after that point; the extractor waits for content itself, and this only avoids evaluating
/// against the previous document.
const PAGE_SETTLE: Duration = Duration::from_millis(750);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CdpTarget {
    id: String,
    #[serde(rename = "type")]
    target_type: String,
    url: String,
    web_socket_debugger_url: Option<String>,
}

pub struct ClassroomCdp {
    socket: WebSocket<MaybeTlsStream<TcpStream>>,
    next_id: u64,
    profile_number: Option<String>,
}

fn cancelled(cancel: &Arc<AtomicBool>) -> Result<(), ClassroomCommandError> {
    if cancel.load(Ordering::Relaxed) {
        Err(ClassroomCommandError::new(
            "CANCELLED",
            "Classroom sync was cancelled.",
            false,
        ))
    } else {
        Ok(())
    }
}

fn is_exact_classroom_origin(value: &str) -> bool {
    Url::parse(value)
        .map(|url| {
            url.scheme() == "https"
                && url.host_str() == Some("classroom.google.com")
                && url.port().is_none()
                && url.username().is_empty()
                && url.password().is_none()
        })
        .unwrap_or(false)
}

fn is_transient_browser_page(value: &str) -> bool {
    value.is_empty()
        || value == "about:blank"
        || value.starts_with("chrome://newtab")
        || value.starts_with("edge://newtab")
}

fn normalized_classroom_path(value: &str) -> Option<String> {
    let url = Url::parse(value).ok()?;
    if !is_exact_classroom_origin(value) {
        return None;
    }
    let segments: Vec<&str> = url.path_segments()?.collect();
    let relevant = if segments.first() == Some(&"u")
        && segments
            .get(1)
            .is_some_and(|segment| segment.chars().all(|character| character.is_ascii_digit()))
    {
        &segments[2..]
    } else {
        &segments[..]
    };
    let path = format!("/{}", relevant.join("/"));
    Some(path.trim_end_matches('/').to_owned())
}

fn classroom_profile_number(value: &str) -> Option<String> {
    let url = Url::parse(value).ok()?;
    if !is_exact_classroom_origin(value) {
        return None;
    }
    let segments: Vec<&str> = url.path_segments()?.collect();
    let profile_number = match segments.as_slice() {
        ["u", profile_number, ..] => *profile_number,
        _ => return None,
    };
    if profile_number.is_empty()
        || profile_number.len() > 10
        || !profile_number
            .chars()
            .all(|character| character.is_ascii_digit())
    {
        return None;
    }
    Some(profile_number.to_owned())
}

fn classroom_url_for_profile(value: &str, profile_number: Option<&str>) -> Option<String> {
    let path = normalized_classroom_path(value)?;
    Some(match profile_number {
        Some(profile_number) if path.is_empty() => {
            format!("https://classroom.google.com/u/{profile_number}/h")
        }
        Some(profile_number) => {
            format!("https://classroom.google.com/u/{profile_number}{path}")
        }
        None => value.to_owned(),
    })
}

fn is_expected_classroom_page(current: &str, requested: &str) -> bool {
    let Some(current_path) = normalized_classroom_path(current) else {
        return false;
    };
    let Some(requested_path) = normalized_classroom_path(requested) else {
        return false;
    };
    if requested_path.is_empty() {
        current_path.is_empty() || current_path == "/h"
    } else if let (Some(current_course), Some(requested_course)) = (
        classwork_course_id(&current_path),
        classwork_course_id(&requested_path),
    ) {
        current_course == requested_course
    } else {
        current_path == requested_path
    }
}

fn classwork_course_id(path: &str) -> Option<&str> {
    let segments: Vec<_> = path.trim_start_matches('/').split('/').collect();
    match segments.as_slice() {
        ["c", course_id, "a"] | ["c", course_id, "a", "all"] => Some(*course_id),
        ["w", course_id, "t", "all"] => Some(*course_id),
        _ => None,
    }
}

fn read_devtools_port(profile: &Path) -> Option<u16> {
    fs::read_to_string(profile.join("DevToolsActivePort"))
        .ok()
        .and_then(|contents| contents.lines().next()?.trim().parse::<u16>().ok())
}

pub fn wait_for_devtools_port(
    profile: &Path,
    child: &Arc<std::sync::Mutex<std::process::Child>>,
    cancel: &Arc<AtomicBool>,
) -> Result<u16, ClassroomCommandError> {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    let mut browser_exited = false;
    while Instant::now() < deadline {
        cancelled(cancel)?;
        if let Some(port) = read_devtools_port(profile) {
            return Ok(port);
        }
        browser_exited |= child
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .try_wait()
            .map(|status| status.is_some())
            .unwrap_or(true);
        thread::sleep(Duration::from_millis(150));
    }
    if browser_exited {
        Err(ClassroomCommandError::new(
            "BROWSER_CLOSED",
            "The browser closed before its debugging endpoint became ready.",
            true,
        ))
    } else {
        Err(ClassroomCommandError::new(
            "CDP_CONNECTION_FAILED",
            "The browser did not expose its loopback debugging endpoint in time.",
            true,
        ))
    }
}

fn list_targets(client: &Client, port: u16) -> Result<Vec<CdpTarget>, ClassroomCommandError> {
    let mut response = client
        .get(format!("http://127.0.0.1:{port}/json/list"))
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|_| {
            ClassroomCommandError::new(
                "CDP_CONNECTION_FAILED",
                "The browser page target could not be discovered.",
                true,
            )
        })?;
    if response.content_length().unwrap_or(0) > 256 * 1024 {
        return Err(ClassroomCommandError::new(
            "CDP_CONNECTION_FAILED",
            "The browser target list exceeded its safe size limit.",
            false,
        ));
    }
    let mut bytes = Vec::new();
    response
        .by_ref()
        .take(256 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| {
            ClassroomCommandError::new(
                "CDP_CONNECTION_FAILED",
                "The browser page target list could not be read.",
                true,
            )
        })?;
    if bytes.len() > 256 * 1024 {
        return Err(ClassroomCommandError::new(
            "CDP_CONNECTION_FAILED",
            "The browser target list exceeded its safe size limit.",
            false,
        ));
    }
    serde_json::from_slice(&bytes).map_err(|_| {
        ClassroomCommandError::new(
            "CDP_CONNECTION_FAILED",
            "The browser page target list was invalid.",
            true,
        )
    })
}

fn validated_loopback_websocket(
    value: &str,
    target_id: &str,
    port: u16,
) -> Result<String, ClassroomCommandError> {
    let url = Url::parse(value).map_err(|_| {
        ClassroomCommandError::new(
            "CDP_CONNECTION_FAILED",
            "The browser returned an invalid debugging endpoint.",
            false,
        )
    })?;
    let expected_path = format!("/devtools/page/{target_id}");
    if url.scheme() != "ws"
        || url.host_str() != Some("127.0.0.1")
        || url.port() != Some(port)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != expected_path
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(ClassroomCommandError::new(
            "UNSUPPORTED_CDP_ENDPOINT",
            "The browser debugging endpoint was not an expected loopback page target.",
            false,
        ));
    }
    Ok(format!("ws://127.0.0.1:{port}{expected_path}"))
}

pub fn connect_classroom_page(
    port: u16,
    cancel: &Arc<AtomicBool>,
) -> Result<ClassroomCdp, ClassroomCommandError> {
    let client = Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|_| {
            ClassroomCommandError::new(
                "CDP_CONNECTION_FAILED",
                "The local browser client could not be initialized.",
                true,
            )
        })?;
    let deadline = Instant::now() + STARTUP_TIMEOUT;

    while Instant::now() < deadline {
        cancelled(cancel)?;
        if let Ok(targets) = list_targets(&client, port) {
            let target = targets
                .iter()
                .find(|target| {
                    target.target_type == "page"
                        && target.web_socket_debugger_url.is_some()
                        && is_exact_classroom_origin(&target.url)
                })
                .or_else(|| {
                    targets.iter().find(|target| {
                        target.target_type == "page"
                            && target.web_socket_debugger_url.is_some()
                            && !is_transient_browser_page(&target.url)
                    })
                });
            if let Some(target) = target {
                let websocket_url = target.web_socket_debugger_url.as_deref().ok_or_else(|| {
                    ClassroomCommandError::new(
                        "CDP_CONNECTION_FAILED",
                        "The browser page has no debugging endpoint.",
                        true,
                    )
                })?;
                let websocket_url = validated_loopback_websocket(websocket_url, &target.id, port)?;
                let (mut socket, _) = connect(websocket_url).map_err(|_| {
                    ClassroomCommandError::new(
                        "CDP_CONNECTION_FAILED",
                        "The browser page debugging connection failed.",
                        true,
                    )
                })?;
                if let MaybeTlsStream::Plain(stream) = socket.get_mut() {
                    let _ = stream.set_read_timeout(Some(CDP_TIMEOUT));
                    let _ = stream.set_write_timeout(Some(CDP_TIMEOUT));
                }
                let mut cdp = ClassroomCdp {
                    socket,
                    next_id: 1,
                    profile_number: classroom_profile_number(&target.url),
                };
                cdp.command("Page.enable", json!({}))?;
                cdp.command("Runtime.enable", json!({}))?;
                if !is_exact_classroom_origin(&target.url) {
                    cdp.navigate(CLASSROOM_URL, cancel)?;
                }
                return Ok(cdp);
            }
        }
        thread::sleep(Duration::from_millis(200));
    }

    Err(ClassroomCommandError::new(
        "CDP_CONNECTION_FAILED",
        "A visible browser page could not be reached in time.",
        true,
    ))
}

impl ClassroomCdp {
    fn command(&mut self, method: &str, params: Value) -> Result<Value, ClassroomCommandError> {
        let id = self.next_id;
        self.next_id += 1;
        let payload = json!({ "id": id, "method": method, "params": params }).to_string();
        self.socket
            .send(Message::Text(payload.into()))
            .map_err(|_| {
                ClassroomCommandError::new(
                    "CDP_CONNECTION_FAILED",
                    "The browser debugging command could not be sent.",
                    true,
                )
            })?;

        loop {
            let message = self.socket.read().map_err(|_| {
                ClassroomCommandError::new(
                    "CDP_CONNECTION_FAILED",
                    "The browser debugging response timed out.",
                    true,
                )
            })?;
            match message {
                Message::Text(text) => {
                    let value: Value = serde_json::from_str(text.as_ref()).map_err(|_| {
                        ClassroomCommandError::new(
                            "CDP_CONNECTION_FAILED",
                            "The browser returned an invalid debugging response.",
                            true,
                        )
                    })?;
                    if value.get("id").and_then(Value::as_u64) != Some(id) {
                        continue;
                    }
                    if value.get("error").is_some() {
                        return Err(ClassroomCommandError::new(
                            "CDP_COMMAND_FAILED",
                            "The browser rejected a required Classroom page command.",
                            true,
                        ));
                    }
                    return Ok(value.get("result").cloned().unwrap_or(Value::Null));
                }
                Message::Ping(payload) => {
                    let _ = self.socket.send(Message::Pong(payload));
                }
                Message::Close(_) => {
                    return Err(ClassroomCommandError::new(
                        "BROWSER_CLOSED",
                        "The browser was closed before Classroom sync completed.",
                        true,
                    ));
                }
                _ => {}
            }
        }
    }

    fn verify_main_frame(&mut self) -> Result<(), ClassroomCommandError> {
        let frame_tree = self.command("Page.getFrameTree", json!({}))?;
        let url = frame_tree
            .pointer("/frameTree/frame/url")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ClassroomCommandError::new(
                    "CDP_COMMAND_FAILED",
                    "The main browser frame could not be verified.",
                    true,
                )
            })?;
        if !is_exact_classroom_origin(url) {
            return Err(ClassroomCommandError::new(
                "LOGIN_REQUIRED",
                "Google Classroom is not open. Complete Google sign-in in the visible browser, then try again.",
                true,
            ));
        }
        Ok(())
    }

    fn current_url(&mut self) -> Result<String, ClassroomCommandError> {
        let result = self.command(
            "Runtime.evaluate",
            json!({
                "expression": "location.href",
                "returnByValue": true,
                "awaitPromise": false
            }),
        )?;
        result
            .pointer("/result/value")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| {
                ClassroomCommandError::new(
                    "CDP_COMMAND_FAILED",
                    "The browser page URL could not be verified.",
                    true,
                )
            })
    }

    fn wait_for_classroom_page(
        &mut self,
        requested_url: &str,
        cancel: &Arc<AtomicBool>,
    ) -> Result<(), ClassroomCommandError> {
        let deadline = Instant::now() + NAVIGATION_TIMEOUT;
        while Instant::now() < deadline {
            cancelled(cancel)?;
            let current_url = self.current_url()?;
            if is_expected_classroom_page(&current_url, requested_url) {
                let ready = self.command(
                    "Runtime.evaluate",
                    json!({
                        "expression": "document.readyState === 'complete' || document.readyState === 'interactive'",
                        "returnByValue": true,
                        "awaitPromise": false
                    }),
                )?.pointer("/result/value").and_then(Value::as_bool).unwrap_or(false);
                if ready {
                    thread::sleep(PAGE_SETTLE);
                    return Ok(());
                }
            } else if !is_transient_browser_page(&current_url)
                && !is_exact_classroom_origin(&current_url)
            {
                return Err(ClassroomCommandError::new(
                    "LOGIN_REQUIRED",
                    "Google Classroom is not open. Complete Google sign-in in the visible browser, then try again.",
                    true,
                ));
            }
            thread::sleep(Duration::from_millis(200));
        }
        Err(ClassroomCommandError::new(
            "NAVIGATION_TIMEOUT",
            "The requested visible Classroom page did not finish loading in time.",
            true,
        ))
    }

    pub fn navigate(
        &mut self,
        url: &str,
        cancel: &Arc<AtomicBool>,
    ) -> Result<(), ClassroomCommandError> {
        if !is_exact_classroom_origin(url) {
            return Err(ClassroomCommandError::new(
                "UNSUPPORTED_GOOGLE_ORIGIN",
                "Only exact Google Classroom HTTPS pages may be opened by the synchronizer.",
                false,
            ));
        }
        if self.profile_number.is_none() {
            self.profile_number = self
                .current_url()
                .ok()
                .and_then(|current_url| classroom_profile_number(&current_url));
        }
        let navigation_url = classroom_url_for_profile(url, self.profile_number.as_deref())
            .ok_or_else(|| {
                ClassroomCommandError::new(
                    "UNSUPPORTED_GOOGLE_ORIGIN",
                    "The Classroom profile URL could not be prepared safely.",
                    false,
                )
            })?;
        let result = self.command("Page.navigate", json!({ "url": navigation_url }))?;
        if result.get("errorText").and_then(Value::as_str).is_some() {
            return Err(ClassroomCommandError::new(
                "NAVIGATION_FAILED",
                "The browser could not open the requested Classroom page.",
                true,
            ));
        }
        self.wait_for_classroom_page(&navigation_url, cancel)
    }

    pub fn extract(
        &mut self,
        cancel: &Arc<AtomicBool>,
    ) -> Result<ExtractedPage, ClassroomCommandError> {
        cancelled(cancel)?;
        self.verify_main_frame()?;
        let current_url = self.current_url()?;
        if !is_exact_classroom_origin(&current_url) {
            return Err(ClassroomCommandError::new(
                "LOGIN_REQUIRED",
                "Google Classroom is not open. Complete Google sign-in in the visible browser, then try again.",
                true,
            ));
        }
        let expression = format!("({EXTRACTOR_SCRIPT})()");
        let result = self.command(
            "Runtime.evaluate",
            json!({
                "expression": expression,
                "returnByValue": true,
                "awaitPromise": true,
                "userGesture": false
            }),
        )?;
        if result.get("exceptionDetails").is_some() {
            return Err(ClassroomCommandError::new(
                "EXTRACTION_FAILED",
                "The fixed Classroom extractor could not read the visible page.",
                true,
            ));
        }
        let value = result.pointer("/result/value").cloned().ok_or_else(|| {
            ClassroomCommandError::new(
                "EXTRACTION_FAILED",
                "The fixed Classroom extractor returned no data.",
                true,
            )
        })?;
        serde_json::from_value(value).map_err(|_| {
            ClassroomCommandError::new(
                "EXTRACTION_FAILED",
                "The fixed Classroom extractor returned invalid data.",
                true,
            )
        })
    }
}
