mod models;
mod repository;

use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::secure_cache::{verify_active_owner, SecureCacheCommandError, SecureCacheState};

pub use models::{
    StudyLocalChangeBatch, StudyLocalLibrary, StudyLocalOutboxEntry, StudyLocalResolution,
    StudyLocalReviewCommand, StudyLocalSnapshot, StudyLocalStatus,
};
use repository::StudySyncRepository;

const MAX_OUTBOX_PAGE: usize = 200;
const MAX_RESOLUTIONS: usize = 200;

#[derive(Clone)]
pub struct StudySyncState {
    repository: Arc<Mutex<Option<StudySyncRepository>>>,
    initialization_error: Arc<Mutex<Option<String>>>,
}

impl StudySyncState {
    pub fn initialize(app: &AppHandle) -> Self {
        let (repository, initialization_error) = match StudySyncRepository::open(app) {
            Ok(repository) => (Some(repository), None),
            Err(error) => (None, Some(error)),
        };
        Self {
            repository: Arc::new(Mutex::new(repository)),
            initialization_error: Arc::new(Mutex::new(initialization_error)),
        }
    }
}

/// Every command runs the same entry check: the call came from the desktop window, and the owner
/// it names is the account currently signed in on this device.
///
/// The commands are declared `#[tauri::command(async)]` for the same reason as the secure cache:
/// a synchronous command runs on the main thread, and reading a whole Study library means
/// decrypting every entity, which is far too much work to do while the window is blocked.
fn guard<T>(
    window: &WebviewWindow,
    cache: &SecureCacheState,
    study: &StudySyncState,
    owner_id: &str,
    operation: impl FnOnce(&StudySyncRepository) -> Result<T, String>,
) -> Result<T, SecureCacheCommandError> {
    crate::secure_cache::verify_caller(window, cache)?;
    verify_active_owner(cache, owner_id)?;

    let repository_guard = study
        .repository
        .lock()
        .map_err(|_| SecureCacheCommandError::unavailable("Local Study storage is unavailable."))?;
    let repository = repository_guard.as_ref().ok_or_else(|| {
        let message = study
            .initialization_error
            .lock()
            .ok()
            .and_then(|error| error.clone())
            .unwrap_or_else(|| "Local Study storage is unavailable.".to_owned());
        SecureCacheCommandError::unavailable(message)
    })?;
    operation(repository).map_err(SecureCacheCommandError::unavailable)
}

#[tauri::command(async)]
pub fn study_local_status(
    window: WebviewWindow,
    cache: State<'_, SecureCacheState>,
    study: State<'_, StudySyncState>,
    owner_id: String,
) -> Result<StudyLocalStatus, SecureCacheCommandError> {
    guard(&window, cache.inner(), study.inner(), &owner_id, |repository| {
        repository.status(&owner_id)
    })
}

#[tauri::command(async)]
pub fn study_local_library(
    window: WebviewWindow,
    cache: State<'_, SecureCacheState>,
    study: State<'_, StudySyncState>,
    owner_id: String,
) -> Result<StudyLocalLibrary, SecureCacheCommandError> {
    guard(&window, cache.inner(), study.inner(), &owner_id, |repository| {
        repository.library(&owner_id)
    })
}

#[tauri::command(async)]
pub fn study_local_apply_snapshot(
    window: WebviewWindow,
    cache: State<'_, SecureCacheState>,
    study: State<'_, StudySyncState>,
    owner_id: String,
    snapshot: StudyLocalSnapshot,
) -> Result<(), SecureCacheCommandError> {
    guard(&window, cache.inner(), study.inner(), &owner_id, |repository| {
        repository.apply_snapshot(&owner_id, &snapshot)
    })
}

#[tauri::command(async)]
pub fn study_local_apply_changes(
    window: WebviewWindow,
    cache: State<'_, SecureCacheState>,
    study: State<'_, StudySyncState>,
    owner_id: String,
    batch: StudyLocalChangeBatch,
) -> Result<(), SecureCacheCommandError> {
    guard(&window, cache.inner(), study.inner(), &owner_id, |repository| {
        repository.apply_changes(&owner_id, &batch)
    })
}

#[tauri::command(async)]
pub fn study_local_record_review(
    window: WebviewWindow,
    cache: State<'_, SecureCacheState>,
    study: State<'_, StudySyncState>,
    owner_id: String,
    command: StudyLocalReviewCommand,
) -> Result<(), SecureCacheCommandError> {
    guard(&window, cache.inner(), study.inner(), &owner_id, |repository| {
        repository.record_review(&owner_id, &command)
    })
}

#[tauri::command(async)]
pub fn study_local_pending(
    window: WebviewWindow,
    cache: State<'_, SecureCacheState>,
    study: State<'_, StudySyncState>,
    owner_id: String,
    limit: Option<usize>,
) -> Result<Vec<StudyLocalOutboxEntry>, SecureCacheCommandError> {
    let limit = limit.unwrap_or(50).clamp(1, MAX_OUTBOX_PAGE);
    guard(&window, cache.inner(), study.inner(), &owner_id, |repository| {
        repository.pending(&owner_id, limit)
    })
}

#[tauri::command(async)]
pub fn study_local_conflicts(
    window: WebviewWindow,
    cache: State<'_, SecureCacheState>,
    study: State<'_, StudySyncState>,
    owner_id: String,
    limit: Option<usize>,
) -> Result<Vec<StudyLocalOutboxEntry>, SecureCacheCommandError> {
    let limit = limit.unwrap_or(50).clamp(1, MAX_OUTBOX_PAGE);
    guard(&window, cache.inner(), study.inner(), &owner_id, |repository| {
        repository.conflicts(&owner_id, limit)
    })
}

#[tauri::command(async)]
pub fn study_local_resolve(
    window: WebviewWindow,
    cache: State<'_, SecureCacheState>,
    study: State<'_, StudySyncState>,
    owner_id: String,
    resolutions: Vec<StudyLocalResolution>,
) -> Result<(), SecureCacheCommandError> {
    if resolutions.len() > MAX_RESOLUTIONS {
        return Err(SecureCacheCommandError::invalid(
            "Too many Study sync results were submitted at once.",
        ));
    }
    guard(&window, cache.inner(), study.inner(), &owner_id, |repository| {
        repository.resolve(&owner_id, &resolutions)
    })
}

#[tauri::command(async)]
pub fn study_local_discard_conflict(
    window: WebviewWindow,
    cache: State<'_, SecureCacheState>,
    study: State<'_, StudySyncState>,
    owner_id: String,
    operation_id: String,
) -> Result<(), SecureCacheCommandError> {
    guard(&window, cache.inner(), study.inner(), &owner_id, |repository| {
        repository.discard_conflict(&owner_id, &operation_id)
    })
}

#[tauri::command(async)]
pub fn study_local_clear(
    window: WebviewWindow,
    cache: State<'_, SecureCacheState>,
    study: State<'_, StudySyncState>,
    owner_id: String,
) -> Result<(), SecureCacheCommandError> {
    guard(&window, cache.inner(), study.inner(), &owner_id, |repository| {
        repository.clear(&owner_id)
    })
}

pub fn initialize(app: &AppHandle) {
    let state = StudySyncState::initialize(app);
    app.manage(state);
}
