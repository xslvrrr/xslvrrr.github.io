#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod assistant_cli;
mod classroom;
mod live_shell;
#[cfg(not(debug_assertions))]
mod local_server;
mod secure_cache;
mod study_sync;

use std::{error::Error, io, sync::Arc};

use tauri::{webview::NewWindowResponse, Manager, Url, WebviewUrl, WebviewWindowBuilder};

#[cfg(debug_assertions)]
const DEVELOPMENT_DESKTOP_ORIGIN: &str = "http://localhost:14200";

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn has_same_origin(url: &Url, trusted_origin: &Url) -> bool {
    url.scheme() == trusted_origin.scheme()
        && url.host_str() == trusted_origin.host_str()
        && url.port_or_known_default() == trusted_origin.port_or_known_default()
}

fn apply_window_controls_visibility(
    window: &tauri::WebviewWindow,
    visible: bool,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSWindow, NSWindowButton};

        let native_window_handle = window.clone();
        window
            .run_on_main_thread(move || {
                let Ok(pointer) = native_window_handle.ns_window() else {
                    return;
                };
                // SAFETY: Tauri supplies a live NSWindow pointer and this closure runs on AppKit's
                // main thread. Retained standard buttons remain owned by their NSWindow.
                let native_window = unsafe { &*(pointer.cast::<NSWindow>()) };
                for kind in [
                    NSWindowButton::CloseButton,
                    NSWindowButton::MiniaturizeButton,
                    NSWindowButton::ZoomButton,
                ] {
                    if let Some(button) = native_window.standardWindowButton(kind) {
                        button.setHidden(!visible);
                    }
                }
            })
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, visible);
    }
    Ok(())
}

#[tauri::command]
fn set_window_controls_visible(window: tauri::WebviewWindow, visible: bool) -> Result<(), String> {
    apply_window_controls_visibility(&window, visible)
}

fn create_main_window(app: &mut tauri::App, desktop_url: Url) -> Result<(), Box<dyn Error>> {
    let mut window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == "main")
        .cloned()
        .ok_or_else(|| io::Error::other("main window configuration is missing"))?;
    window_config.url = WebviewUrl::External(desktop_url.clone());
    let trusted_origin = desktop_url;

    let window = WebviewWindowBuilder::from_config(app, &window_config)?
        .on_navigation(move |url| has_same_origin(url, &trusted_origin))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()?;
    apply_window_controls_visibility(&window, false).map_err(io::Error::other)?;
    focus_main_window(app.handle());
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(assistant_cli::AssistantCliManager::default())
        .manage(classroom::ClassroomManager::default())
        .invoke_handler(tauri::generate_handler![
            set_window_controls_visible,
            assistant_cli::detect_assistant_clis,
            assistant_cli::run_assistant_cli,
            assistant_cli::cancel_assistant_cli,
            classroom::detect_classroom_browsers,
            classroom::get_classroom_browser_permission,
            classroom::request_classroom_browser_permission,
            classroom::start_classroom_sync,
            classroom::continue_classroom_sync,
            classroom::get_classroom_sync_status,
            classroom::cancel_classroom_sync,
            classroom::disconnect_classroom,
            classroom::open_browser_permission_settings,
            classroom::get_classroom_automation_diagnostics,
            classroom::repair_classroom_automation,
            live_shell::desktop_shell_status,
            live_shell::desktop_shell_check,
            secure_cache::read_desktop_identity,
            secure_cache::write_desktop_identity,
            secure_cache::read_secure_cache,
            secure_cache::secure_cache_record_exists,
            secure_cache::write_secure_cache,
            secure_cache::read_saved_classroom_snapshot,
            secure_cache::delete_saved_classroom_snapshot,
            secure_cache::write_desktop_bootstrap,
            secure_cache::delete_secure_cache,
            secure_cache::clear_secure_owner,
            secure_cache::clear_secure_cache,
            study_sync::study_local_status,
            study_sync::study_local_library,
            study_sync::study_local_apply_snapshot,
            study_sync::study_local_apply_changes,
            study_sync::study_local_record_review,
            study_sync::study_local_pending,
            study_sync::study_local_conflicts,
            study_sync::study_local_resolve,
            study_sync::study_local_discard_conflict,
            study_sync::study_local_clear,
        ])
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<classroom::ClassroomManager>().shutdown();
            }
        })
        .setup(|app| {
            // Runs before any window so an installed ad-hoc build stops being translocated on the
            // next launch, which is what blocks the macOS browser automation prompt.
            classroom::clear_install_quarantine_flag();
            classroom::cleanup_stale_profiles(app.handle())
                .map_err(|error| io::Error::other(error.message))?;
            let secure_cache_state = secure_cache::initialize(app.handle());
            // Opens after the secure cache so both share one migrated database file.
            study_sync::initialize(app.handle());

            // The live shell is restored before the window opens so a previously downloaded UI
            // serves immediately, then refreshed in the background against the web deployment.
            let shell = live_shell::LiveShell::new(app.handle(), live_shell::backend_origin());
            app.manage(Arc::clone(&shell));

            #[cfg(not(debug_assertions))]
            let desktop_url =
                local_server::start(Arc::clone(&shell)).map_err(io::Error::other)?;
            #[cfg(debug_assertions)]
            let desktop_url = Url::parse(DEVELOPMENT_DESKTOP_ORIGIN).map_err(io::Error::other)?;
            #[cfg(not(debug_assertions))]
            live_shell::spawn_synchronization(app.handle().clone(), Arc::clone(&shell));
            secure_cache_state
                .set_desktop_origin(&desktop_url)
                .map_err(io::Error::other)?;
            create_main_window(app, desktop_url)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
