use std::{
    env, fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::Duration,
};
#[cfg(target_os = "macos")]
use std::{thread, time::Instant};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use super::models::{
    ClassroomAutomationDiagnostics, ClassroomAutomationRepair, ClassroomBrowser,
    ClassroomBrowserPermission, ClassroomCommandError,
};

const PROFILE_MARKER: &str = ".millennium-classroom-profile-v1";
const PROFILE_MARKER_PREFIX: &str = "Millennium Classroom profile v1\nowner-scope:";
const LEGACY_PROFILE_MARKER: &str = "Millennium Classroom profile v1\n";
const CLASSROOM_URL: &str = "https://classroom.google.com/";
/// How long a permission check that gates reading waits for a just-launched browser to register
/// with the operating system before reporting it as not running.
const NOT_RUNNING_GRACE: Duration = Duration::from_secs(3);

struct BrowserCandidate {
    id: &'static str,
    name: &'static str,
    paths: Vec<PathBuf>,
}

pub struct DetectedBrowser {
    pub descriptor: ClassroomBrowser,
    pub executable_path: PathBuf,
}

fn browser_candidates() -> Vec<BrowserCandidate> {
    #[cfg(target_os = "macos")]
    {
        let home = env::var_os("HOME").map(PathBuf::from);
        let with_user_application = |system_path: &str, user_path: &str| {
            let mut paths = vec![PathBuf::from(system_path)];
            if let Some(home_path) = &home {
                paths.push(home_path.join(user_path));
            }
            paths
        };
        return vec![
            BrowserCandidate {
                id: "chrome",
                name: "Google Chrome",
                paths: with_user_application(
                    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                    "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                ),
            },
            BrowserCandidate {
                id: "chromium",
                name: "Chromium",
                paths: with_user_application(
                    "/Applications/Chromium.app/Contents/MacOS/Chromium",
                    "Applications/Chromium.app/Contents/MacOS/Chromium",
                ),
            },
            BrowserCandidate {
                id: "edge",
                name: "Microsoft Edge",
                paths: with_user_application(
                    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                    "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                ),
            },
        ];
    }

    #[cfg(target_os = "windows")]
    {
        let local = env::var_os("LOCALAPPDATA").map(PathBuf::from);
        let program_files = env::var_os("PROGRAMFILES").map(PathBuf::from);
        let program_files_x86 = env::var_os("PROGRAMFILES(X86)").map(PathBuf::from);
        let collect = |suffix: &str| {
            [&local, &program_files, &program_files_x86]
                .into_iter()
                .filter_map(|root| root.as_ref().map(|path| path.join(suffix)))
                .collect()
        };
        return vec![
            BrowserCandidate {
                id: "chrome",
                name: "Google Chrome",
                paths: collect(r"Google\Chrome\Application\chrome.exe"),
            },
            BrowserCandidate {
                id: "edge",
                name: "Microsoft Edge",
                paths: collect(r"Microsoft\Edge\Application\msedge.exe"),
            },
        ];
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        vec![
            BrowserCandidate {
                id: "chrome",
                name: "Google Chrome",
                paths: vec![
                    PathBuf::from("/usr/bin/google-chrome"),
                    PathBuf::from("/usr/bin/google-chrome-stable"),
                ],
            },
            BrowserCandidate {
                id: "chromium",
                name: "Chromium",
                paths: vec![
                    PathBuf::from("/usr/bin/chromium"),
                    PathBuf::from("/usr/bin/chromium-browser"),
                ],
            },
            BrowserCandidate {
                id: "edge",
                name: "Microsoft Edge",
                paths: vec![
                    PathBuf::from("/usr/bin/microsoft-edge"),
                    PathBuf::from("/usr/bin/microsoft-edge-stable"),
                ],
            },
        ]
    }
}

fn is_regular_non_symlink(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_file() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn detected_browsers() -> Vec<DetectedBrowser> {
    browser_candidates()
        .into_iter()
        .filter_map(|candidate| {
            candidate
                .paths
                .into_iter()
                .find(|path| is_regular_non_symlink(path))
                .map(|executable_path| DetectedBrowser {
                    descriptor: ClassroomBrowser {
                        id: candidate.id.to_owned(),
                        name: candidate.name.to_owned(),
                    },
                    executable_path,
                })
        })
        .collect()
}

pub fn detect_browsers() -> Vec<ClassroomBrowser> {
    detected_browsers()
        .into_iter()
        .map(|browser| browser.descriptor)
        .collect()
}

pub fn detected_browser(browser_id: &str) -> Result<DetectedBrowser, ClassroomCommandError> {
    detected_browsers()
        .into_iter()
        .find(|browser| browser.descriptor.id == browser_id)
        .ok_or_else(|| {
            ClassroomCommandError::new(
                "BROWSER_MISSING",
                "The selected Chrome-family browser is not installed.",
                false,
            )
        })
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct AppleEventDescriptor {
    descriptor_type: u32,
    data_handle: *mut std::ffi::c_void,
}

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AECreateDesc(
        type_code: u32,
        data: *const std::ffi::c_void,
        data_size: isize,
        result: *mut AppleEventDescriptor,
    ) -> i16;
    fn AEDisposeDesc(descriptor: *mut AppleEventDescriptor) -> i16;
    fn AEDeterminePermissionToAutomateTarget(
        target: *const AppleEventDescriptor,
        event_class: u32,
        event_id: u32,
        ask_user_if_needed: u8,
    ) -> i32;
}

#[cfg(target_os = "macos")]
fn four_character_code(value: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*value)
}

#[cfg(target_os = "macos")]
fn browser_bundle_identifier(browser_id: &str) -> Result<&'static str, ClassroomCommandError> {
    match browser_id {
        "chrome" => Ok("com.google.Chrome"),
        "chromium" => Ok("org.chromium.Chromium"),
        "edge" => Ok("com.microsoft.edgemac"),
        _ => Err(ClassroomCommandError::new(
            "BROWSER_MISSING",
            "The selected Chrome-family browser is not installed.",
            false,
        )),
    }
}

/// Returns the automation permission plus the raw `OSStatus` behind it. The status code is kept so
/// the permission dialog can tell a real denial apart from "the browser is not running yet", which
/// otherwise both surfaced as an unexplained dead end.
#[cfg(target_os = "macos")]
fn determine_automation_permission(
    browser_id: &str,
    ask_user_if_needed: bool,
    not_running_grace: Duration,
) -> Result<(ClassroomBrowserPermission, i32), ClassroomCommandError> {
    let bundle_id = browser_bundle_identifier(browser_id)?;
    let mut target = AppleEventDescriptor {
        descriptor_type: 0,
        data_handle: std::ptr::null_mut(),
    };
    // SAFETY: ApplicationServices copies bundle_id bytes into target. Descriptor is disposed
    // after synchronous permission determination.
    let create_status = unsafe {
        AECreateDesc(
            four_character_code(b"bund"),
            bundle_id.as_ptr().cast(),
            bundle_id.len() as isize,
            &mut target,
        )
    };
    if create_status != 0 {
        return Err(ClassroomCommandError::new(
            "BROWSER_PERMISSION_UNAVAILABLE",
            "macOS could not prepare the browser permission request.",
            true,
        ));
    }
    // `core/getd` requests read automation. A newly launched browser can take a few seconds to
    // register with Launch Services, so do not treat `procNotFound` as final while a caller is
    // willing to wait.
    let deadline = Instant::now()
        + if ask_user_if_needed {
            Duration::from_secs(10)
        } else {
            not_running_grace
        };
    let permission_status = loop {
        let status = unsafe {
            AEDeterminePermissionToAutomateTarget(
                &target,
                four_character_code(b"core"),
                four_character_code(b"getd"),
                u8::from(ask_user_if_needed),
            )
        };
        if status != -600 || Instant::now() >= deadline {
            break status;
        }
        thread::sleep(Duration::from_millis(200));
    };
    unsafe {
        let _ = AEDisposeDesc(&mut target);
    }
    let permission = match permission_status {
        0 => ClassroomBrowserPermission::Granted,
        -1743 => ClassroomBrowserPermission::Denied,
        -1744 => ClassroomBrowserPermission::PromptRequired,
        -600 => ClassroomBrowserPermission::BrowserNotRunning,
        _ => ClassroomBrowserPermission::Unavailable,
    };
    Ok((permission, permission_status))
}

#[cfg(target_os = "macos")]
fn automation_permission(
    browser_id: &str,
    ask_user_if_needed: bool,
    not_running_grace: Duration,
) -> Result<ClassroomBrowserPermission, ClassroomCommandError> {
    determine_automation_permission(browser_id, ask_user_if_needed, not_running_grace)
        .map(|(permission, _)| permission)
}

#[cfg(not(target_os = "macos"))]
fn automation_permission(
    _browser_id: &str,
    _ask_user_if_needed: bool,
    _not_running_grace: Duration,
) -> Result<ClassroomBrowserPermission, ClassroomCommandError> {
    Ok(ClassroomBrowserPermission::NotRequired)
}

/// Non-prompting status for polling callers. Answers immediately so the permission dialog stays
/// responsive while it refreshes.
pub fn browser_permission_status(
    browser_id: &str,
) -> Result<ClassroomBrowserPermission, ClassroomCommandError> {
    automation_permission(browser_id, false, Duration::ZERO)
}

/// Non-prompting status for the gate in front of reading. The browser was launched moments earlier
/// and can still be registering with Launch Services, and reporting that as a missing permission
/// failed the sync before it opened a single Classroom page.
pub fn browser_permission_status_for_read(
    browser_id: &str,
) -> Result<ClassroomBrowserPermission, ClassroomCommandError> {
    automation_permission(browser_id, false, NOT_RUNNING_GRACE)
}

/// macOS only presents its Automation prompt for a signed application bundle carrying
/// `NSAppleEventsUsageDescription`. An unpackaged development binary silently fails the request,
/// which previously surfaced as an in-app dialog that never resolved.
#[cfg(target_os = "macos")]
fn app_bundle_path() -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    // Contents/MacOS/<binary> -> Contents/MacOS -> Contents -> <name>.app
    let bundle = executable.parent()?.parent()?.parent()?;
    bundle
        .extension()
        .is_some_and(|value| value == "app")
        .then(|| bundle.to_path_buf())
}

#[cfg(target_os = "macos")]
fn command_succeeds(program: &str, arguments: &[&std::ffi::OsStr]) -> bool {
    Command::new(program)
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// A downloaded ad-hoc build keeps `com.apple.quarantine`. Gatekeeper then runs it from a
/// randomised read-only App Translocation mount, and macOS will not record an Automation grant for
/// a path that changes on every launch.
#[cfg(target_os = "macos")]
fn is_quarantined(bundle: &Path) -> bool {
    command_succeeds(
        "/usr/bin/xattr",
        &[
            "-p".as_ref(),
            "com.apple.quarantine".as_ref(),
            bundle.as_os_str(),
        ],
    )
}

#[cfg(target_os = "macos")]
fn is_translocated(bundle: &Path) -> bool {
    bundle.to_string_lossy().contains("/AppTranslocation/")
}

#[cfg(target_os = "macos")]
fn has_valid_signature(bundle: &Path) -> bool {
    command_succeeds(
        "/usr/bin/codesign",
        &["--verify".as_ref(), "--strict".as_ref(), bundle.as_os_str()],
    )
}

#[cfg(target_os = "macos")]
fn has_apple_events_usage_description(bundle: &Path) -> bool {
    let info_plist = bundle.join("Contents").join("Info.plist");
    command_succeeds(
        "/usr/bin/plutil",
        &[
            "-extract".as_ref(),
            "NSAppleEventsUsageDescription".as_ref(),
            "raw".as_ref(),
            "-o".as_ref(),
            "-".as_ref(),
            info_plist.as_os_str(),
        ],
    )
}

/// Reverse-DNS shape check before an identifier reaches `tccutil`. The identifier comes from the
/// app's own configuration rather than the renderer, but a repair action must never be able to
/// reset another application's privacy grants.
#[cfg(target_os = "macos")]
fn is_safe_bundle_identifier(identifier: &str) -> bool {
    !identifier.is_empty()
        && identifier.len() <= 255
        && identifier.contains('.')
        && identifier
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-'))
}

#[cfg(target_os = "macos")]
pub fn automation_diagnostics(
    browser_id: &str,
    bundle_identifier: &str,
) -> Result<ClassroomAutomationDiagnostics, ClassroomCommandError> {
    let browser = detected_browser(browser_id)?;
    let (permission, status_code) =
        determine_automation_permission(browser_id, false, Duration::ZERO)?;
    let bundle = app_bundle_path();
    let is_quarantined = bundle.as_deref().is_some_and(is_quarantined);
    let is_translocated = bundle.as_deref().is_some_and(is_translocated);
    let is_in_applications = bundle.as_deref().is_some_and(|path| {
        path.starts_with("/Applications") || path.to_string_lossy().contains("/Applications/")
    });
    let browser_running = status_code != -600;

    Ok(ClassroomAutomationDiagnostics {
        required: true,
        permission,
        status_code,
        bundle_identifier: bundle_identifier.to_owned(),
        bundle_path: bundle
            .as_deref()
            .map(|path| path.to_string_lossy().into_owned()),
        browser_name: browser.descriptor.name,
        is_packaged: bundle.is_some(),
        is_quarantined,
        is_translocated,
        is_in_applications,
        signature_valid: bundle.as_deref().is_some_and(has_valid_signature),
        has_usage_description: bundle
            .as_deref()
            .is_some_and(has_apple_events_usage_description),
        browser_running,
        can_repair: is_quarantined || is_safe_bundle_identifier(bundle_identifier),
    })
}

/// Clears the download quarantine flag from an installed copy on launch.
///
/// Millennium is ad-hoc signed and cannot be notarised, so every download keeps
/// `com.apple.quarantine`. That flag makes Gatekeeper run later launches from a randomised
/// read-only App Translocation path, which macOS will not attach a durable Automation grant to —
/// the browser permission prompt then never appears and never records an entry the user could find
/// in System Settings.
///
/// This only ever touches Millennium's own bundle, and only once the user has already installed it
/// into an Applications folder and opened it, so it changes nothing about whether the app is
/// allowed to launch. A translocated copy is skipped because the path is a throwaway.
#[cfg(target_os = "macos")]
pub fn clear_own_quarantine_flag() {
    let Some(bundle) = app_bundle_path() else {
        return;
    };
    let is_installed = bundle.to_string_lossy().contains("/Applications/");
    if is_translocated(&bundle) || !is_installed || !is_quarantined(&bundle) {
        return;
    }
    let _ = command_succeeds(
        "/usr/bin/xattr",
        &[
            "-dr".as_ref(),
            "com.apple.quarantine".as_ref(),
            bundle.as_os_str(),
        ],
    );
}

#[cfg(not(target_os = "macos"))]
pub fn clear_own_quarantine_flag() {}

/// Clears the two things that keep an ad-hoc build from ever reaching the Automation prompt:
/// the quarantine flag on its own bundle, and a stale or denied `kTCCServiceAppleEvents` record.
///
/// System Settings deliberately offers no way to add an Automation entry by hand, so resetting the
/// record is the only supported way to make macOS ask again after a denial.
#[cfg(target_os = "macos")]
pub fn repair_automation_permission(
    browser_id: &str,
    bundle_identifier: &str,
) -> Result<ClassroomAutomationRepair, ClassroomCommandError> {
    let mut notes = Vec::new();
    let bundle = app_bundle_path();

    let quarantine_cleared = match bundle.as_deref() {
        None => {
            notes.push(
                "Running from an unpackaged development build, so there is no bundle to unquarantine."
                    .to_owned(),
            );
            false
        }
        Some(path) if !is_quarantined(path) => {
            notes.push("The application bundle was already free of the quarantine flag.".to_owned());
            false
        }
        Some(path) => {
            let cleared = command_succeeds(
                "/usr/bin/xattr",
                &[
                    "-dr".as_ref(),
                    "com.apple.quarantine".as_ref(),
                    path.as_os_str(),
                ],
            );
            notes.push(if cleared {
                "Removed the download quarantine flag from Millennium.".to_owned()
            } else {
                "The quarantine flag could not be removed. Millennium may be installed in a location this account cannot modify.".to_owned()
            });
            cleared
        }
    };

    let permission_reset = if is_safe_bundle_identifier(bundle_identifier) {
        let reset = command_succeeds(
            "/usr/bin/tccutil",
            &[
                "reset".as_ref(),
                "AppleEvents".as_ref(),
                bundle_identifier.as_ref(),
            ],
        );
        notes.push(if reset {
            "Cleared the stored browser automation decision so macOS will ask again.".to_owned()
        } else {
            "The stored browser automation decision could not be cleared automatically."
                .to_owned()
        });
        reset
    } else {
        false
    };

    if bundle.as_deref().is_some_and(is_translocated) {
        notes.push(
            "macOS is running Millennium from a temporary read-only copy. Quit Millennium, drag it to the Applications folder, and open it from there."
                .to_owned(),
        );
    }

    Ok(ClassroomAutomationRepair {
        quarantine_cleared,
        permission_reset,
        notes,
        diagnostics: automation_diagnostics(browser_id, bundle_identifier)?,
    })
}

#[cfg(not(target_os = "macos"))]
pub fn automation_diagnostics(
    browser_id: &str,
    bundle_identifier: &str,
) -> Result<ClassroomAutomationDiagnostics, ClassroomCommandError> {
    let browser = detected_browser(browser_id)?;
    Ok(ClassroomAutomationDiagnostics {
        required: false,
        permission: ClassroomBrowserPermission::NotRequired,
        status_code: 0,
        bundle_identifier: bundle_identifier.to_owned(),
        bundle_path: None,
        browser_name: browser.descriptor.name,
        is_packaged: true,
        is_quarantined: false,
        is_translocated: false,
        is_in_applications: true,
        signature_valid: true,
        has_usage_description: true,
        browser_running: true,
        can_repair: false,
    })
}

#[cfg(not(target_os = "macos"))]
pub fn repair_automation_permission(
    browser_id: &str,
    bundle_identifier: &str,
) -> Result<ClassroomAutomationRepair, ClassroomCommandError> {
    Ok(ClassroomAutomationRepair {
        quarantine_cleared: false,
        permission_reset: false,
        notes: vec![
            "This operating system does not gate browser reading behind a privacy setting."
                .to_owned(),
        ],
        diagnostics: automation_diagnostics(browser_id, bundle_identifier)?,
    })
}

pub fn request_automation_permission(
    browser_id: &str,
) -> Result<ClassroomBrowserPermission, ClassroomCommandError> {
    #[cfg(target_os = "macos")]
    match app_bundle_path() {
        // An unpackaged development binary silently fails the request.
        None => return Ok(ClassroomBrowserPermission::PromptUnavailable),
        // Gatekeeper runs quarantined ad-hoc builds from a randomised read-only copy. macOS will
        // not bind an Automation grant to a path that changes every launch, so asking here would
        // show a prompt that never takes effect.
        Some(bundle) if is_translocated(&bundle) => {
            return Ok(ClassroomBrowserPermission::PromptUnavailable)
        }
        Some(_) => {}
    }
    automation_permission(browser_id, true, Duration::ZERO)
}

/// Opens the system pane where browser automation access is granted or revoked.
#[cfg(target_os = "macos")]
pub fn open_automation_settings() -> Result<(), ClassroomCommandError> {
    std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")
        .spawn()
        .map(|_| ())
        .map_err(|error| {
            ClassroomCommandError::new(
                "BROWSER_PERMISSION_SETTINGS_UNAVAILABLE",
                format!("System Settings could not be opened: {error}"),
                true,
            )
        })
}

#[cfg(not(target_os = "macos"))]
pub fn open_automation_settings() -> Result<(), ClassroomCommandError> {
    Err(ClassroomCommandError::new(
        "BROWSER_PERMISSION_SETTINGS_UNSUPPORTED",
        "This operating system does not gate browser reading behind a privacy setting.",
        false,
    ))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

fn owner_scope(owner_id: &str) -> String {
    hex_encode(&Sha256::digest(owner_id.as_bytes()))
}

fn profile_marker(owner_id: &str) -> String {
    format!("{PROFILE_MARKER_PREFIX}{}\n", owner_scope(owner_id))
}

fn is_owned_profile_marker(contents: &str) -> bool {
    if contents == LEGACY_PROFILE_MARKER {
        return true;
    }
    contents
        .strip_prefix(PROFILE_MARKER_PREFIX)
        .and_then(|value| value.strip_suffix('\n'))
        .is_some_and(|scope| {
            scope.len() == 64 && scope.chars().all(|character| character.is_ascii_hexdigit())
        })
}

pub fn profile_path(
    app: &AppHandle,
    operation_id: &str,
    owner_id: &str,
    keep_signed_in: bool,
) -> Result<PathBuf, ClassroomCommandError> {
    let base = if keep_signed_in {
        app.path().app_data_dir()
    } else {
        app.path().app_cache_dir()
    }
    .map_err(|_| {
        ClassroomCommandError::new(
            "PROFILE_UNAVAILABLE",
            "The app profile directory is unavailable.",
            false,
        )
    })?;

    let path = if keep_signed_in {
        base.join("classroom")
            .join("browser-profiles")
            .join(owner_scope(owner_id))
    } else {
        base.join("classroom").join("sessions").join(operation_id)
    };
    let expected_marker = profile_marker(owner_id);
    if path.exists() {
        let metadata = fs::symlink_metadata(&path).map_err(|_| {
            ClassroomCommandError::new(
                "PROFILE_UNAVAILABLE",
                "The dedicated Classroom browser profile could not be inspected.",
                false,
            )
        })?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(ClassroomCommandError::new(
                "PROFILE_NOT_OWNED",
                "Refusing to use a Classroom profile path that is not an app-owned directory.",
                false,
            ));
        }
        let marker = fs::read_to_string(path.join(PROFILE_MARKER)).unwrap_or_default();
        if marker != expected_marker {
            return Err(ClassroomCommandError::new(
                "PROFILE_NOT_OWNED",
                "Refusing to use a Classroom profile that is not bound to the active desktop owner.",
                false,
            ));
        }
        if !keep_signed_in {
            fs::remove_dir_all(&path).map_err(|_| {
                ClassroomCommandError::new(
                    "PROFILE_DELETE_FAILED",
                    "A stale temporary Classroom profile could not be removed.",
                    true,
                )
            })?;
        }
    }
    let is_new = !path.exists();
    fs::create_dir_all(&path).map_err(|_| {
        ClassroomCommandError::new(
            "PROFILE_UNAVAILABLE",
            "The dedicated Classroom browser profile could not be created.",
            true,
        )
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).map_err(|_| {
            ClassroomCommandError::new(
                "PROFILE_UNAVAILABLE",
                "The dedicated Classroom browser profile permissions could not be secured.",
                true,
            )
        })?;
    }
    if is_new {
        fs::write(path.join(PROFILE_MARKER), expected_marker.as_bytes()).map_err(|_| {
            ClassroomCommandError::new(
                "PROFILE_UNAVAILABLE",
                "The dedicated Classroom browser profile could not be marked as app-owned.",
                true,
            )
        })?;
    }
    let devtools_port_file = path.join("DevToolsActivePort");
    if devtools_port_file.exists() {
        fs::remove_file(devtools_port_file).map_err(|_| {
            ClassroomCommandError::new(
                "PROFILE_UNAVAILABLE",
                "A stale browser debugging endpoint could not be cleared safely.",
                true,
            )
        })?;
    }
    Ok(path)
}

pub fn launch_browser(
    browser: &DetectedBrowser,
    profile: &Path,
) -> Result<Child, ClassroomCommandError> {
    Command::new(&browser.executable_path)
        .arg(format!("--user-data-dir={}", profile.to_string_lossy()))
        .arg("--remote-debugging-address=127.0.0.1")
        .arg("--remote-debugging-port=0")
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-background-mode")
        .arg("--new-window")
        .arg(CLASSROOM_URL)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| {
            ClassroomCommandError::new(
                "BROWSER_LAUNCH_FAILED",
                "The browser could not be launched.",
                true,
            )
        })
}

pub fn stop_browser(child: &mut Child) -> Result<(), ClassroomCommandError> {
    let is_running = child
        .try_wait()
        .map(|status| status.is_none())
        .map_err(|_| {
            ClassroomCommandError::new(
                "BROWSER_STOP_FAILED",
                "The Classroom browser process state could not be checked.",
                true,
            )
        })?;
    if is_running {
        child.kill().map_err(|_| {
            ClassroomCommandError::new(
                "BROWSER_STOP_FAILED",
                "The Classroom browser could not be stopped.",
                true,
            )
        })?;
        child.wait().map_err(|_| {
            ClassroomCommandError::new(
                "BROWSER_STOP_FAILED",
                "The Classroom browser shutdown could not be confirmed.",
                true,
            )
        })?;
    }
    Ok(())
}

pub fn remove_owned_profile(path: &Path) -> Result<(), ClassroomCommandError> {
    if !path.exists() {
        return Ok(());
    }
    let marker = path.join(PROFILE_MARKER);
    let is_owned = fs::read_to_string(marker)
        .map(|contents| is_owned_profile_marker(&contents))
        .unwrap_or(false);
    if !is_owned {
        return Err(ClassroomCommandError::new(
            "PROFILE_NOT_OWNED",
            "Refusing to remove a browser profile that is not marked as Millennium-owned.",
            false,
        ));
    }
    fs::remove_dir_all(path).map_err(|_| {
        ClassroomCommandError::new(
            "PROFILE_DELETE_FAILED",
            "The dedicated Classroom browser profile could not be removed.",
            true,
        )
    })
}

pub fn cleanup_stale_temporary_profiles(app: &AppHandle) -> Result<(), ClassroomCommandError> {
    let cache_dir = app.path().app_cache_dir().map_err(|_| {
        ClassroomCommandError::new(
            "PROFILE_UNAVAILABLE",
            "The app profile directory is unavailable.",
            false,
        )
    })?;
    let sessions_dir = cache_dir.join("classroom").join("sessions");
    let entries = match fs::read_dir(sessions_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => {
            return Err(ClassroomCommandError::new(
                "PROFILE_UNAVAILABLE",
                "Stale temporary Classroom profiles could not be inspected.",
                true,
            ));
        }
    };
    for entry in entries {
        let path = entry
            .map_err(|_| {
                ClassroomCommandError::new(
                    "PROFILE_UNAVAILABLE",
                    "A stale temporary Classroom profile could not be inspected.",
                    true,
                )
            })?
            .path();
        let is_directory = fs::symlink_metadata(&path)
            .map(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
            .unwrap_or(false);
        if is_directory {
            remove_owned_profile(&path)?;
        }
    }
    Ok(())
}

pub fn persistent_profile_path(
    app: &AppHandle,
    owner_id: &str,
) -> Result<PathBuf, ClassroomCommandError> {
    app.path()
        .app_data_dir()
        .map(|path| {
            path.join("classroom")
                .join("browser-profiles")
                .join(owner_scope(owner_id))
        })
        .map_err(|_| {
            ClassroomCommandError::new(
                "PROFILE_UNAVAILABLE",
                "The app profile directory is unavailable.",
                false,
            )
        })
}

pub fn legacy_persistent_profile_path(app: &AppHandle) -> Result<PathBuf, ClassroomCommandError> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("classroom").join("browser-profile"))
        .map_err(|_| {
            ClassroomCommandError::new(
                "PROFILE_UNAVAILABLE",
                "The app profile directory is unavailable.",
                false,
            )
        })
}
