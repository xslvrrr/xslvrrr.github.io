pub(crate) mod crypto;
mod models;
mod repository;

use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use reqwest::Url;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::classroom::{ClassroomCacheMutationGuard, ClassroomManager};

pub use models::{
    DesktopBootstrapRequest, DesktopIdentity, DesktopRecordReconciliation, SecureCacheCommandError,
    SecureRecordKind,
};
pub(crate) use repository::{database_path, open_connection};
use repository::SecureCacheRepository;

const MAX_PORTAL_CACHE_BYTES: usize = 8 * 1024 * 1024;
const MAX_CLASSROOM_CACHE_BYTES: usize = 4 * 1024 * 1024;
const MAX_BOOTSTRAP_CACHE_BYTES: usize = 8 * 1024 * 1024;
const MAX_CACHE_DEPTH: usize = 32;
const MAX_FUTURE_SKEW_SECONDS: i64 = 5 * 60;

#[derive(Clone)]
pub struct SecureCacheState {
    repository: Arc<Mutex<Option<SecureCacheRepository>>>,
    initialization_error: Arc<Mutex<Option<String>>>,
    desktop_origin: Arc<Mutex<Option<Url>>>,
    app: AppHandle,
}

#[derive(Clone, Copy)]
pub(crate) enum ClassroomSnapshotWriteOutcome {
    Written,
    Preserved,
}

impl SecureCacheState {
    pub fn initialize(app: &AppHandle) -> Self {
        let (repository, initialization_error) = match SecureCacheRepository::open(app) {
            Ok(repository) => (Some(repository), None),
            Err(error) => (None, Some(error)),
        };
        Self {
            repository: Arc::new(Mutex::new(repository)),
            initialization_error: Arc::new(Mutex::new(initialization_error)),
            desktop_origin: Arc::new(Mutex::new(None)),
            app: app.clone(),
        }
    }

    pub fn set_desktop_origin(&self, origin: &Url) -> Result<(), String> {
        if origin.scheme() != "http"
            || origin.host_str() != Some("localhost")
            || origin.port_or_known_default().is_none()
        {
            return Err("The desktop origin is invalid.".to_owned());
        }
        let mut desktop_origin = self
            .desktop_origin
            .lock()
            .map_err(|_| "The desktop origin state is unavailable.".to_owned())?;
        *desktop_origin = Some(origin.clone());
        Ok(())
    }
}

pub(crate) fn verify_caller(
    window: &WebviewWindow,
    state: &SecureCacheState,
) -> Result<(), SecureCacheCommandError> {
    let url = window.url().map_err(|_| {
        SecureCacheCommandError::invalid("The desktop page origin could not be verified.")
    })?;
    let desktop_origin = state
        .desktop_origin
        .lock()
        .map_err(|_| {
            SecureCacheCommandError::unavailable("The desktop origin state is unavailable.")
        })?
        .clone()
        .ok_or_else(|| {
            SecureCacheCommandError::unavailable("The desktop origin is unavailable.")
        })?;
    if window.label() != "main"
        || url.scheme() != desktop_origin.scheme()
        || url.host_str() != desktop_origin.host_str()
        || url.port_or_known_default() != desktop_origin.port_or_known_default()
    {
        return Err(SecureCacheCommandError::invalid(
            "Local cache access is restricted to the Millennium desktop window.",
        ));
    }
    Ok(())
}

fn reserve_classroom_cache_mutation(
    state: &ClassroomManager,
) -> Result<ClassroomCacheMutationGuard, SecureCacheCommandError> {
    state
        .reserve_cache_mutation()
        .ok_or_else(SecureCacheCommandError::classroom_sync_active)
}

/// Every cache command is declared `#[tauri::command(async)]`. A plain `#[tauri::command]` on a
/// synchronous function runs on the main thread, and these operations open SQLite, decrypt
/// multi-megabyte snapshots, and occasionally `VACUUM` — all of which froze the window while they
/// ran. The `(async)` form keeps the bodies synchronous but moves them onto the async runtime.
fn with_repository<T>(
    state: &SecureCacheState,
    operation: impl FnOnce(&mut SecureCacheRepository) -> Result<T, String>,
) -> Result<T, SecureCacheCommandError> {
    let mut repository_guard = state
        .repository
        .lock()
        .map_err(|_| SecureCacheCommandError::unavailable("Local cache state is unavailable."))?;
    let repository = repository_guard.as_mut().ok_or_else(|| {
        let message = state
            .initialization_error
            .lock()
            .ok()
            .and_then(|error| error.clone())
            .unwrap_or_else(|| "Secure local storage is unavailable.".to_owned());
        SecureCacheCommandError::unavailable(message)
    })?;
    operation(repository).map_err(|message| {
        if message == "OWNER_MISMATCH" {
            SecureCacheCommandError::owner_mismatch()
        } else if message == "OWNER_SWITCH_REQUIRED" {
            SecureCacheCommandError::owner_switch_required()
        } else {
            SecureCacheCommandError::unavailable(message)
        }
    })
}

#[tauri::command(async)]
pub fn read_desktop_identity(
    window: WebviewWindow,
    state: State<'_, SecureCacheState>,
) -> Result<Option<DesktopIdentity>, SecureCacheCommandError> {
    verify_caller(&window, state.inner())?;
    with_repository(state.inner(), SecureCacheRepository::read_identity)
}

#[tauri::command(async)]
pub fn write_desktop_identity(
    window: WebviewWindow,
    state: State<'_, SecureCacheState>,
    identity: DesktopIdentity,
) -> Result<(), SecureCacheCommandError> {
    verify_caller(&window, state.inner())?;
    validate_identity(&identity)?;
    with_repository(state.inner(), |repository| {
        repository.write_identity(&identity)
    })
}

#[tauri::command(async)]
pub fn read_secure_cache(
    window: WebviewWindow,
    state: State<'_, SecureCacheState>,
    owner_id: String,
    kind: SecureRecordKind,
) -> Result<Option<Value>, SecureCacheCommandError> {
    verify_caller(&window, state.inner())?;
    validate_owner_id(&owner_id)?;
    with_repository(state.inner(), |repository| {
        repository.read_record(&owner_id, kind)
    })
}

#[tauri::command(async)]
pub fn secure_cache_record_exists(
    window: WebviewWindow,
    state: State<'_, SecureCacheState>,
    owner_id: String,
    kind: SecureRecordKind,
) -> Result<bool, SecureCacheCommandError> {
    verify_caller(&window, state.inner())?;
    validate_owner_id(&owner_id)?;
    with_repository(state.inner(), |repository| {
        repository.has_record(&owner_id, kind)
    })
}

#[tauri::command(async)]
pub fn write_secure_cache(
    window: WebviewWindow,
    state: State<'_, SecureCacheState>,
    owner_id: String,
    kind: SecureRecordKind,
    payload: Value,
) -> Result<(), SecureCacheCommandError> {
    verify_caller(&window, state.inner())?;
    validate_owner_id(&owner_id)?;
    validate_secure_record(kind, &payload)?;
    with_repository(state.inner(), |repository| {
        repository
            .write_record(&owner_id, kind, &payload)
            .map(|_| ())
    })
}

pub(crate) fn verify_active_owner(
    state: &SecureCacheState,
    owner_id: &str,
) -> Result<(), SecureCacheCommandError> {
    validate_owner_id(owner_id)?;
    with_repository(state, |repository| repository.verify_owner(owner_id))
}

pub(crate) fn read_classroom_snapshot_for_owner(
    state: &SecureCacheState,
    owner_id: &str,
) -> Result<Option<Value>, SecureCacheCommandError> {
    validate_owner_id(owner_id)?;
    let snapshot = with_repository(state, |repository| {
        repository.read_record(owner_id, SecureRecordKind::ClassroomData)
    })?;
    if let Some(payload) = &snapshot {
        validate_secure_record(SecureRecordKind::ClassroomData, payload)?;
    }
    Ok(snapshot)
}

pub(crate) fn classroom_snapshot_available_for_sync(
    state: &SecureCacheState,
    owner_id: &str,
) -> Result<bool, SecureCacheCommandError> {
    validate_owner_id(owner_id)?;
    let snapshot = with_repository(state, |repository| {
        repository.read_record(owner_id, SecureRecordKind::ClassroomData)
    })?;
    Ok(snapshot.as_ref().is_some_and(is_valid_classroom_payload))
}

pub(crate) fn save_classroom_snapshot(
    state: &SecureCacheState,
    owner_id: &str,
    payload: &Value,
) -> Result<ClassroomSnapshotWriteOutcome, SecureCacheCommandError> {
    validate_owner_id(owner_id)?;
    validate_secure_record(SecureRecordKind::ClassroomData, payload)?;
    with_repository(state, |repository| {
        let existing = repository.read_record(owner_id, SecureRecordKind::ClassroomData)?;
        if existing
            .as_ref()
            .is_some_and(|value| !is_valid_classroom_payload(value))
        {
            repository.overwrite_record(owner_id, SecureRecordKind::ClassroomData, payload)?;
            return Ok(ClassroomSnapshotWriteOutcome::Written);
        }
        repository
            .write_record(owner_id, SecureRecordKind::ClassroomData, payload)
            .map(|was_written| {
                if was_written {
                    ClassroomSnapshotWriteOutcome::Written
                } else {
                    ClassroomSnapshotWriteOutcome::Preserved
                }
            })
    })
}

#[tauri::command(async)]
pub fn read_saved_classroom_snapshot(
    window: WebviewWindow,
    state: State<'_, SecureCacheState>,
    owner_id: String,
) -> Result<Option<Value>, SecureCacheCommandError> {
    verify_caller(&window, state.inner())?;
    read_classroom_snapshot_for_owner(state.inner(), &owner_id)
}

#[tauri::command(async)]
pub fn delete_saved_classroom_snapshot(
    window: WebviewWindow,
    state: State<'_, SecureCacheState>,
    classroom_state: State<'_, ClassroomManager>,
    owner_id: String,
) -> Result<(), SecureCacheCommandError> {
    verify_caller(&window, state.inner())?;
    let _mutation_guard = reserve_classroom_cache_mutation(classroom_state.inner())?;
    validate_owner_id(&owner_id)?;
    with_repository(state.inner(), |repository| {
        repository.delete_record(&owner_id, SecureRecordKind::ClassroomData)
    })
}

#[tauri::command(async)]
pub fn write_desktop_bootstrap(
    window: WebviewWindow,
    state: State<'_, SecureCacheState>,
    request: DesktopBootstrapRequest,
) -> Result<(), SecureCacheCommandError> {
    verify_caller(&window, state.inner())?;
    validate_identity(&request.identity)?;
    validate_bootstrap_request(&request)?;
    with_repository(state.inner(), |repository| {
        repository.write_bootstrap(&request)
    })
}

#[tauri::command(async)]
pub fn delete_secure_cache(
    window: WebviewWindow,
    state: State<'_, SecureCacheState>,
    classroom_state: State<'_, ClassroomManager>,
    owner_id: String,
    kind: SecureRecordKind,
) -> Result<(), SecureCacheCommandError> {
    verify_caller(&window, state.inner())?;
    let _mutation_guard = if matches!(kind, SecureRecordKind::ClassroomData) {
        Some(reserve_classroom_cache_mutation(classroom_state.inner())?)
    } else {
        None
    };
    validate_owner_id(&owner_id)?;
    with_repository(state.inner(), |repository| {
        repository.delete_record(&owner_id, kind)
    })
}

#[tauri::command(async)]
pub fn clear_secure_owner(
    window: WebviewWindow,
    state: State<'_, SecureCacheState>,
    classroom_state: State<'_, ClassroomManager>,
    owner_id: String,
) -> Result<(), SecureCacheCommandError> {
    verify_caller(&window, state.inner())?;
    let _mutation_guard = reserve_classroom_cache_mutation(classroom_state.inner())?;
    validate_owner_id(&owner_id)?;
    with_repository(state.inner(), |repository| {
        repository.clear_owner(&owner_id)
    })
}

#[tauri::command(async)]
pub fn clear_secure_cache(
    window: WebviewWindow,
    state: State<'_, SecureCacheState>,
    classroom_state: State<'_, ClassroomManager>,
) -> Result<(), SecureCacheCommandError> {
    verify_caller(&window, state.inner())?;
    let _mutation_guard = reserve_classroom_cache_mutation(classroom_state.inner())?;
    let mut repository_guard = state
        .repository
        .lock()
        .map_err(|_| SecureCacheCommandError::unavailable("Local cache state is unavailable."))?;
    if let Some(repository) = repository_guard.as_mut() {
        repository
            .clear_all()
            .map_err(SecureCacheCommandError::unavailable)?;
    } else {
        let replacement = SecureCacheRepository::reset_irrecoverable(&state.app)
            .map_err(SecureCacheCommandError::unavailable)?;
        *repository_guard = Some(replacement);
    }
    if let Ok(mut error) = state.initialization_error.lock() {
        *error = None;
    }
    Ok(())
}

fn validate_identity(identity: &DesktopIdentity) -> Result<(), SecureCacheCommandError> {
    validate_owner_id(&identity.owner_id)?;
    if identity.display_name.trim().is_empty() || identity.display_name.encode_utf16().count() > 200
    {
        return Err(SecureCacheCommandError::invalid(
            "Desktop identity name is invalid.",
        ));
    }
    if identity.school.trim().is_empty() || identity.school.encode_utf16().count() > 200 {
        return Err(SecureCacheCommandError::invalid(
            "Desktop identity school is invalid.",
        ));
    }
    if identity
        .role
        .as_deref()
        .is_some_and(|role| role != "user" && role != "admin")
    {
        return Err(SecureCacheCommandError::invalid(
            "Desktop identity role is invalid.",
        ));
    }
    if !is_valid_timestamp(&identity.last_authenticated_at)
        || identity
            .last_bootstrap_at
            .as_deref()
            .is_some_and(|timestamp| !is_valid_timestamp(timestamp))
    {
        return Err(SecureCacheCommandError::invalid(
            "Desktop identity timestamps are invalid.",
        ));
    }
    if identity.schema_version != models::CACHE_SCHEMA_VERSION {
        return Err(SecureCacheCommandError::invalid(
            "Desktop identity schema is unsupported.",
        ));
    }
    Ok(())
}

fn validate_bootstrap_request(
    request: &DesktopBootstrapRequest,
) -> Result<(), SecureCacheCommandError> {
    validate_json_limits(&request.bootstrap, MAX_BOOTSTRAP_CACHE_BYTES)?;
    if !request.bootstrap.is_object()
        || request.bootstrap.get("ownerId").and_then(Value::as_str)
            != Some(request.identity.owner_id.as_str())
    {
        return Err(SecureCacheCommandError::invalid(
            "Desktop bootstrap metadata is invalid.",
        ));
    }

    validate_bootstrap_record(
        &request.portal_data,
        MAX_PORTAL_CACHE_BYTES,
        |payload| {
            let portal_uid_matches = match (
                request.identity.portal_uid.as_deref(),
                payload.pointer("/user/uid").and_then(Value::as_str),
            ) {
                (Some(expected), Some(actual)) => expected == actual,
                (Some(_), None) => false,
                _ => true,
            };
            is_valid_portal_payload(payload)
                && payload.get("userId").and_then(Value::as_str)
                    == Some(request.identity.owner_id.as_str())
                && portal_uid_matches
        },
        "Desktop bootstrap portal data is invalid.",
    )?;
    validate_bootstrap_record(
        &request.classroom_data,
        MAX_CLASSROOM_CACHE_BYTES,
        |payload| {
            is_valid_classroom_payload(payload)
                && payload.get("ownerId").and_then(Value::as_str)
                    == Some(request.identity.owner_id.as_str())
        },
        "Desktop bootstrap Classroom data is invalid.",
    )
}

fn validate_secure_record(
    kind: SecureRecordKind,
    payload: &Value,
) -> Result<(), SecureCacheCommandError> {
    let (maximum_bytes, is_valid, message): (usize, fn(&Value) -> bool, &'static str) = match kind {
        SecureRecordKind::PortalData => (
            MAX_PORTAL_CACHE_BYTES,
            is_valid_portal_payload,
            "Desktop portal cache data is invalid.",
        ),
        SecureRecordKind::ClassroomData => (
            MAX_CLASSROOM_CACHE_BYTES,
            is_valid_classroom_payload,
            "Desktop Classroom cache data is invalid.",
        ),
        SecureRecordKind::Bootstrap => (
            MAX_BOOTSTRAP_CACHE_BYTES,
            is_valid_bootstrap_metadata,
            "Desktop bootstrap metadata is invalid.",
        ),
    };
    validate_json_limits(payload, maximum_bytes)?;
    if !is_valid(payload) {
        return Err(SecureCacheCommandError::invalid(message));
    }
    Ok(())
}

fn validate_bootstrap_record(
    reconciliation: &DesktopRecordReconciliation,
    maximum_bytes: usize,
    validate: impl FnOnce(&Value) -> bool,
    message: &'static str,
) -> Result<(), SecureCacheCommandError> {
    match reconciliation {
        DesktopRecordReconciliation::Preserve => Ok(()),
        DesktopRecordReconciliation::Replace(payload) => {
            validate_json_limits(payload, maximum_bytes)?;
            if validate(payload) {
                Ok(())
            } else {
                Err(SecureCacheCommandError::invalid(message))
            }
        }
    }
}

fn is_valid_portal_payload(payload: &Value) -> bool {
    payload.get("user").is_some_and(Value::is_object)
        && payload
            .get("userId")
            .and_then(Value::as_str)
            .is_some_and(|owner_id| !owner_id.trim().is_empty() && owner_id.len() <= 128)
        && payload
            .get("lastUpdated")
            .and_then(Value::as_str)
            .is_some_and(is_valid_timestamp)
}

fn is_valid_classroom_payload(payload: &Value) -> bool {
    if !has_only_keys(
        payload,
        &["ownerId", "version", "courses", "items", "coverage", "sync"],
    ) || payload.get("version").and_then(Value::as_u64) != Some(1)
        || !payload
            .get("ownerId")
            .and_then(Value::as_str)
            .is_some_and(|owner_id| !owner_id.trim().is_empty() && owner_id.len() <= 128)
    {
        return false;
    }
    let Some(courses) = payload.get("courses").and_then(Value::as_array) else {
        return false;
    };
    let Some(items) = payload.get("items").and_then(Value::as_array) else {
        return false;
    };
    if courses.len() > 200 || items.len() > 10_000 {
        return false;
    }

    let mut course_ids_by_source = HashMap::with_capacity(courses.len());
    for course in courses {
        let Some((source_id, course_id)) = valid_classroom_course(course) else {
            return false;
        };
        if course_ids_by_source.insert(source_id, course_id).is_some() {
            return false;
        }
    }

    let mut item_ids = HashSet::with_capacity(items.len());
    let mut attachment_count = 0usize;
    let mut status_counts = [0u64; 5];
    for item in items {
        let Some((item_id, item_attachments, status)) =
            valid_classroom_item(item, &course_ids_by_source)
        else {
            return false;
        };
        if !item_ids.insert(item_id) {
            return false;
        }
        attachment_count = attachment_count.saturating_add(item_attachments);
        if attachment_count > 25_000 {
            return false;
        }
        match status {
            Some("assigned") => status_counts[0] += 1,
            Some("turned-in") => status_counts[1] += 1,
            Some("returned") => status_counts[2] += 1,
            Some("missing") => status_counts[3] += 1,
            Some("graded") => status_counts[4] += 1,
            Some("unknown") | None => {}
            Some(_) => return false,
        }
    }

    let Some(coverage) = valid_classroom_coverage(payload.get("coverage"), courses.len()) else {
        return false;
    };
    valid_classroom_sync(
        payload.get("sync"),
        courses.len(),
        items.len(),
        attachment_count,
        status_counts,
        coverage,
    )
}

fn has_only_keys(value: &Value, allowed: &[&str]) -> bool {
    value
        .as_object()
        .is_some_and(|object| object.keys().all(|key| allowed.contains(&key.as_str())))
}

fn is_bounded_text(value: &str, maximum: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= maximum
}

fn is_valid_source_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
}

fn classroom_stable_id(namespace: &str, parts: &[&str]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("millennium:classroom:{namespace}:v1\0").as_bytes());
    hasher.update(parts.join("\0").as_bytes());
    let encoded = URL_SAFE_NO_PAD.encode(hasher.finalize());
    format!("{namespace}_{}", &encoded[..24])
}

fn valid_classroom_course(course: &Value) -> Option<(String, String)> {
    if !has_only_keys(
        course,
        &["id", "title", "url", "section", "room", "teacher"],
    ) {
        return None;
    }
    let id = course.get("id")?.as_str()?;
    let title = course.get("title")?.as_str()?;
    let url = Url::parse(course.get("url")?.as_str()?).ok()?;
    let segments: Vec<_> = url.path_segments()?.collect();
    if !is_bounded_text(title, 500)
        || course.get("section").is_some_and(|value| {
            !value
                .as_str()
                .is_some_and(|text| is_bounded_text(text, 500))
        })
        || course.get("room").is_some_and(|value| {
            !value
                .as_str()
                .is_some_and(|text| is_bounded_text(text, 500))
        })
        || course.get("teacher").is_some_and(|value| {
            !value
                .as_str()
                .is_some_and(|text| is_bounded_text(text, 500))
        })
        || url.scheme() != "https"
        || url.host_str() != Some("classroom.google.com")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || segments.len() != 2
        || segments[0] != "c"
        || !is_valid_source_id(segments[1])
        || id != classroom_stable_id("course", &[segments[1]])
    {
        return None;
    }
    Some((segments[1].to_owned(), id.to_owned()))
}

fn valid_classroom_item<'a>(
    item: &'a Value,
    course_ids_by_source: &HashMap<String, String>,
) -> Option<(&'a str, usize, Option<&'a str>)> {
    if !has_only_keys(
        item,
        &[
            "id",
            "courseId",
            "kind",
            "title",
            "url",
            "description",
            "postedAt",
            "dueAt",
            "submission",
            "attachments",
        ],
    ) {
        return None;
    }
    let id = item.get("id")?.as_str()?;
    let course_id = item.get("courseId")?.as_str()?;
    let kind = item.get("kind")?.as_str()?;
    let title = item.get("title")?.as_str()?;
    let parsed = Url::parse(item.get("url")?.as_str()?).ok()?;
    let segments: Vec<_> = parsed.path_segments()?.collect();
    if !is_bounded_text(title, 500)
        || !matches!(
            kind,
            "assignment" | "material" | "question" | "announcement" | "unknown"
        )
        || item.get("description").is_some_and(|value| {
            !value
                .as_str()
                .is_some_and(|text| is_bounded_text(text, 20_000))
        })
        || item
            .get("postedAt")
            .is_some_and(|value| !value.as_str().is_some_and(is_valid_iso_timestamp))
        || item
            .get("dueAt")
            .is_some_and(|value| !value.as_str().is_some_and(is_valid_iso_timestamp))
        || parsed.scheme() != "https"
        || parsed.host_str() != Some("classroom.google.com")
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || segments.len() < 4
        || segments[0] != "c"
        || !matches!(segments[2], "a" | "m" | "p" | "q" | "sa")
        || !is_valid_source_id(segments[1])
        || !is_valid_source_id(segments[3])
        || segments
            .get(4..)
            .is_none_or(|suffix| !suffix.is_empty() && suffix != ["details"])
        || course_ids_by_source.get(segments[1]).map(String::as_str) != Some(course_id)
        || id != classroom_stable_id("item", &[segments[1], segments[3]])
    {
        return None;
    }

    let status = match item.get("submission") {
        None => None,
        Some(submission) => {
            if !has_only_keys(submission, &["status", "grade", "maxPoints"]) {
                return None;
            }
            let status = submission.get("status")?.as_str()?;
            if !matches!(
                status,
                "assigned" | "turned-in" | "returned" | "missing" | "graded" | "unknown"
            ) || submission.get("grade").is_some_and(|value| {
                !value.as_f64().is_some_and(|number| {
                    number.is_finite() && (0.0..=1_000_000.0).contains(&number)
                })
            }) || submission.get("maxPoints").is_some_and(|value| {
                !value.as_f64().is_some_and(|number| {
                    number.is_finite() && (0.0..=1_000_000.0).contains(&number)
                })
            }) {
                return None;
            }
            Some(status)
        }
    };
    let attachments = item.get("attachments")?.as_array()?;
    if attachments.len() > 20 || !attachments.iter().all(valid_classroom_attachment) {
        return None;
    }
    Some((id, attachments.len(), status))
}

fn classroom_attachment_source_id(url: &Url) -> String {
    let segments: Vec<_> = url
        .path_segments()
        .map(|segments| segments.collect())
        .unwrap_or_default();
    let source_id = match (url.host_str(), segments.as_slice()) {
        (Some("drive.google.com"), ["file", "d", source_id, ..]) => Some(*source_id),
        (
            Some("docs.google.com"),
            ["document" | "spreadsheets" | "presentation" | "forms", "d", source_id, ..],
        ) => Some(*source_id),
        _ => None,
    };
    source_id
        .filter(|source_id| is_valid_source_id(source_id))
        .map(str::to_owned)
        .unwrap_or_else(|| classroom_stable_id("link", &[url.as_str()]))
}

fn valid_classroom_attachment(attachment: &Value) -> bool {
    if !has_only_keys(attachment, &["id", "name", "url", "kind"]) {
        return false;
    }
    let Some(id) = attachment.get("id").and_then(Value::as_str) else {
        return false;
    };
    let Some(name) = attachment.get("name").and_then(Value::as_str) else {
        return false;
    };
    let Some(url) = attachment.get("url").and_then(Value::as_str) else {
        return false;
    };
    let Some(kind) = attachment.get("kind").and_then(Value::as_str) else {
        return false;
    };
    let Ok(parsed) = Url::parse(url) else {
        return false;
    };
    let Some(hostname) = parsed.host_str() else {
        return false;
    };
    let source_id = classroom_attachment_source_id(&parsed);
    id == classroom_stable_id("attachment", &[hostname, &source_id])
        && is_bounded_text(name, 500)
        && parsed.scheme() == "https"
        && matches!(hostname, "docs.google.com" | "drive.google.com")
        && parsed.port().is_none()
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.query().is_none()
        && parsed.fragment().is_none()
        && matches!(
            kind,
            "document" | "spreadsheet" | "presentation" | "drive-file" | "link"
        )
}

#[derive(Clone, Copy)]
struct ValidatedClassroomCoverage {
    course_list_visited: bool,
    course_list_complete: bool,
    empty_state_observed: bool,
    course_pages_visited: u64,
    course_pages_failed: u64,
    issue_count: usize,
}

fn valid_classroom_coverage(
    coverage: Option<&Value>,
    course_count: usize,
) -> Option<ValidatedClassroomCoverage> {
    let coverage = coverage?;
    if !has_only_keys(
        coverage,
        &[
            "courseListVisited",
            "courseListComplete",
            "emptyStateObserved",
            "coursesObserved",
            "coursePagesVisited",
            "coursePagesFailed",
            "issues",
        ],
    ) {
        return None;
    }
    let course_list_visited = coverage.get("courseListVisited")?.as_bool()?;
    let course_list_complete = coverage.get("courseListComplete")?.as_bool()?;
    let empty_state_observed = coverage.get("emptyStateObserved")?.as_bool()?;
    let courses_observed = coverage.get("coursesObserved")?.as_u64()?;
    let course_pages_visited = coverage.get("coursePagesVisited")?.as_u64()?;
    let course_pages_failed = coverage.get("coursePagesFailed")?.as_u64()?;
    let issues = coverage.get("issues")?.as_array()?;
    if courses_observed != course_count as u64
        || course_pages_visited > course_count as u64
        || course_pages_failed > course_count as u64
        || course_pages_visited.saturating_add(course_pages_failed) > course_count as u64
        || issues.len() > 100
        || !issues.iter().all(|issue| {
            issue
                .as_str()
                .is_some_and(|message| is_bounded_text(message, 1_000))
        })
    {
        return None;
    }
    Some(ValidatedClassroomCoverage {
        course_list_visited,
        course_list_complete,
        empty_state_observed,
        course_pages_visited,
        course_pages_failed,
        issue_count: issues.len(),
    })
}

fn valid_classroom_sync(
    sync: Option<&Value>,
    course_count: usize,
    item_count: usize,
    attachment_count: usize,
    status_counts: [u64; 5],
    coverage: ValidatedClassroomCoverage,
) -> bool {
    let Some(sync) = sync else {
        return false;
    };
    if !has_only_keys(
        sync,
        &[
            "source",
            "extractorVersion",
            "syncedAt",
            "accountHint",
            "integrity",
            "counts",
        ],
    ) || sync.get("source").and_then(Value::as_str) != Some("desktop-browser")
        || !sync
            .get("extractorVersion")
            .and_then(Value::as_str)
            .is_some_and(|version| is_bounded_text(version, 100))
        || !sync
            .get("syncedAt")
            .and_then(Value::as_str)
            .is_some_and(is_valid_timestamp)
        || sync.get("accountHint").is_some_and(|hint| {
            !hint
                .as_str()
                .is_some_and(|value| is_bounded_text(value, 320))
        })
    {
        return false;
    }
    let expected_integrity = if course_count == 0 && item_count == 0 {
        if coverage.course_list_visited
            && coverage.course_list_complete
            && coverage.empty_state_observed
            && coverage.course_pages_visited == 0
            && coverage.course_pages_failed == 0
            && coverage.issue_count == 0
        {
            "verified-empty"
        } else {
            return false;
        }
    } else if coverage.course_list_visited
        && coverage.course_list_complete
        && coverage.course_pages_visited == course_count as u64
        && coverage.course_pages_failed == 0
        && coverage.issue_count == 0
    {
        "complete"
    } else {
        "partial"
    };
    if sync.get("integrity").and_then(Value::as_str) != Some(expected_integrity) {
        return false;
    }
    let Some(counts) = sync.get("counts") else {
        return false;
    };
    has_only_keys(
        counts,
        &[
            "courses",
            "items",
            "attachments",
            "assigned",
            "turnedIn",
            "returned",
            "missing",
            "graded",
        ],
    ) && counts.get("courses").and_then(Value::as_u64) == Some(course_count as u64)
        && counts.get("items").and_then(Value::as_u64) == Some(item_count as u64)
        && counts.get("attachments").and_then(Value::as_u64) == Some(attachment_count as u64)
        && counts.get("assigned").and_then(Value::as_u64) == Some(status_counts[0])
        && counts.get("turnedIn").and_then(Value::as_u64) == Some(status_counts[1])
        && counts.get("returned").and_then(Value::as_u64) == Some(status_counts[2])
        && counts.get("missing").and_then(Value::as_u64) == Some(status_counts[3])
        && counts.get("graded").and_then(Value::as_u64) == Some(status_counts[4])
}

fn is_valid_bootstrap_metadata(payload: &Value) -> bool {
    payload.is_object()
        && payload
            .get("ownerId")
            .and_then(Value::as_str)
            .is_some_and(|owner_id| !owner_id.trim().is_empty() && owner_id.len() <= 128)
}

fn validate_json_limits(
    payload: &Value,
    maximum_bytes: usize,
) -> Result<(), SecureCacheCommandError> {
    let serialized = serde_json::to_vec(payload).map_err(|_| {
        SecureCacheCommandError::invalid("Desktop cache data could not be validated.")
    })?;
    if serialized.len() > maximum_bytes || exceeds_json_depth(payload, 0) {
        return Err(SecureCacheCommandError::invalid(
            "Desktop cache data exceeds its storage limits.",
        ));
    }
    Ok(())
}

fn exceeds_json_depth(value: &Value, depth: usize) -> bool {
    if depth > MAX_CACHE_DEPTH {
        return true;
    }
    match value {
        Value::Array(values) => values
            .iter()
            .any(|entry| exceeds_json_depth(entry, depth + 1)),
        Value::Object(values) => values
            .values()
            .any(|entry| exceeds_json_depth(entry, depth + 1)),
        _ => false,
    }
}

fn is_valid_iso_timestamp(value: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(value).is_ok()
}

fn is_valid_timestamp(value: &str) -> bool {
    let Ok(timestamp) = chrono::DateTime::parse_from_rfc3339(value) else {
        return false;
    };
    let unix_timestamp = timestamp.timestamp();
    unix_timestamp >= 946_684_800
        && unix_timestamp <= chrono::Utc::now().timestamp() + MAX_FUTURE_SKEW_SECONDS
}

fn validate_owner_id(owner_id: &str) -> Result<(), SecureCacheCommandError> {
    if owner_id.trim().is_empty() || owner_id.len() > 128 {
        return Err(SecureCacheCommandError::invalid(
            "Desktop cache owner is invalid.",
        ));
    }
    Ok(())
}

pub fn initialize(app: &AppHandle) -> SecureCacheState {
    let state = SecureCacheState::initialize(app);
    app.manage(state.clone());
    state
}
