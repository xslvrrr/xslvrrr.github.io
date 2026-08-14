mod browser;
mod cdp;
mod models;

use std::{
    collections::BTreeMap,
    path::PathBuf,
    process::Child,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::Utc;
use reqwest::Url;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State, WebviewWindow};

use crate::secure_cache::{self, ClassroomSnapshotWriteOutcome, SecureCacheState};

use models::{
    ClassroomAttachment, ClassroomAttachmentKind, ClassroomCounts, ClassroomCourse,
    ClassroomCoverage, ClassroomItem, ClassroomItemKind, ClassroomLocalSnapshotState,
    ClassroomSnapshotIntegrity, ClassroomSubmission, ClassroomSubmissionStatus,
    ClassroomSyncMetadata, DesktopClassroomSnapshot, ExtractedAttachment, ExtractedCourse,
    ExtractedItem, ExtractedPage, ExtractedSubmission,
};
pub use models::{
    ClassroomAutomationDiagnostics, ClassroomAutomationRepair, ClassroomBrowser,
    ClassroomBrowserPermission, ClassroomCommandError, ClassroomSyncPhase, ClassroomSyncStatus,
    StartClassroomSyncInput,
};

const MAX_COURSES: usize = 200;
const MAX_ITEMS: usize = 10_000;
const MAX_ATTACHMENTS_PER_ITEM: usize = 20;
const MAX_ISSUES: usize = 100;
const MAX_TITLE_LENGTH: usize = 500;
const MAX_DESCRIPTION_LENGTH: usize = 20_000;
const MAX_ACCOUNT_HINT_LENGTH: usize = 320;
const EXTRACTOR_VERSION: &str = "desktop-dom-v3";
#[derive(Clone)]
struct ActiveOperation {
    operation_id: String,
    owner_id: String,
    browser_id: String,
    child: Arc<Mutex<Child>>,
    cancel: Arc<AtomicBool>,
    profile_path: PathBuf,
    keep_signed_in: bool,
    port: Option<u16>,
}

#[derive(Default)]
struct ManagerInner {
    status: ClassroomSyncStatus,
    operation: Option<ActiveOperation>,
    is_starting: bool,
    is_cache_mutating: bool,
    starting_cancel: Option<Arc<AtomicBool>>,
    starting_delete_profile: Option<Arc<AtomicBool>>,
}

#[derive(Clone, Default)]
pub struct ClassroomManager {
    inner: Arc<Mutex<ManagerInner>>,
}

pub(crate) struct ClassroomCacheMutationGuard {
    manager: ClassroomManager,
}

impl Drop for ClassroomCacheMutationGuard {
    fn drop(&mut self) {
        if let Ok(mut inner) = self.manager.inner.lock() {
            inner.is_cache_mutating = false;
        }
    }
}

impl ClassroomManager {
    pub(crate) fn reserve_cache_mutation(&self) -> Option<ClassroomCacheMutationGuard> {
        let mut inner = self.inner.lock().ok()?;
        if inner.operation.is_some() || inner.is_starting || inner.is_cache_mutating {
            return None;
        }
        inner.is_cache_mutating = true;
        Some(ClassroomCacheMutationGuard {
            manager: self.clone(),
        })
    }

    pub fn shutdown(&self) {
        let (operation, starting_cancel) = {
            let mut inner = self.inner.lock().unwrap_or_else(|error| error.into_inner());
            inner.is_starting = false;
            inner.starting_delete_profile = None;
            (inner.operation.take(), inner.starting_cancel.take())
        };
        if let Some(cancel) = starting_cancel {
            cancel.store(true, Ordering::Relaxed);
        }
        if let Some(operation) = operation {
            operation.cancel.store(true, Ordering::Relaxed);
            let _ = stop_and_cleanup(&operation);
        }
    }
}

struct SyncWork {
    operation_id: String,
    owner_id: String,
    child: Arc<Mutex<Child>>,
    cancel: Arc<AtomicBool>,
    profile_path: PathBuf,
    keep_signed_in: bool,
    port: u16,
}

fn lock_error() -> ClassroomCommandError {
    ClassroomCommandError::new(
        "STATE_UNAVAILABLE",
        "Classroom sync state is unavailable.",
        true,
    )
}

fn cache_error(error: secure_cache::SecureCacheCommandError) -> ClassroomCommandError {
    let code = match error.code {
        "OWNER_MISMATCH" => "OWNER_MISMATCH",
        "INVALID_CACHE_INPUT" => "INVALID_COMMAND_INPUT",
        _ => "SECURE_CACHE_UNAVAILABLE",
    };
    ClassroomCommandError::new(code, error.message, error.retryable)
}

fn approved_caller(
    window: &WebviewWindow,
    cache_state: &SecureCacheState,
) -> Result<(), ClassroomCommandError> {
    secure_cache::verify_caller(window, cache_state)
        .map_err(|error| ClassroomCommandError::new("INVALID_CALLER_ORIGIN", error.message, false))
}

fn generate_operation_id() -> Result<String, ClassroomCommandError> {
    let mut random = [0u8; 16];
    getrandom::fill(&mut random).map_err(|_| {
        ClassroomCommandError::new(
            "OPERATION_ID_UNAVAILABLE",
            "A secure Classroom operation identifier could not be generated.",
            true,
        )
    })?;
    Ok(format!("classroom-{}", hex_encode(&random)))
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

fn stable_id(namespace: &str, parts: &[&str]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("millennium:classroom:{namespace}:v1\0").as_bytes());
    hasher.update(parts.join("\0").as_bytes());
    let encoded = URL_SAFE_NO_PAD.encode(hasher.finalize());
    format!("{namespace}_{}", &encoded[..24])
}

fn stop_and_cleanup(operation: &ActiveOperation) -> Result<(), ClassroomCommandError> {
    let mut child = operation
        .child
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    browser::stop_browser(&mut child)?;
    if !operation.keep_signed_in {
        browser::remove_owned_profile(&operation.profile_path)?;
    }
    Ok(())
}

fn stop_work(work: &SyncWork) -> Result<(), ClassroomCommandError> {
    let mut child = work.child.lock().unwrap_or_else(|error| error.into_inner());
    browser::stop_browser(&mut child)?;
    if !work.keep_signed_in {
        browser::remove_owned_profile(&work.profile_path)?;
    }
    Ok(())
}

fn remove_requested_persistent_profile(
    app: &AppHandle,
    owner_id: &str,
    delete_profile: &AtomicBool,
) -> Result<bool, ClassroomCommandError> {
    if !delete_profile.load(Ordering::Relaxed) {
        return Ok(false);
    }
    browser::remove_owned_profile(&browser::persistent_profile_path(app, owner_id)?)?;
    browser::remove_owned_profile(&browser::legacy_persistent_profile_path(app)?)?;
    Ok(true)
}

fn operation_matches(inner: &ManagerInner, operation_id: &str, cancel: &Arc<AtomicBool>) -> bool {
    inner.operation.as_ref().is_some_and(|operation| {
        operation.operation_id == operation_id && Arc::ptr_eq(&operation.cancel, cancel)
    })
}

fn restore_local_snapshot_state(status: &mut ClassroomSyncStatus) {
    if matches!(
        status.local_snapshot_state,
        ClassroomLocalSnapshotState::Saving
    ) {
        status.local_snapshot_state = match status.local_snapshot_available {
            Some(true) => ClassroomLocalSnapshotState::Existing,
            Some(false) => ClassroomLocalSnapshotState::Missing,
            None => ClassroomLocalSnapshotState::Unknown,
        };
    }
}

fn fail_status(manager: &ClassroomManager, work: &SyncWork, error: &ClassroomCommandError) {
    if let Ok(mut inner) = manager.inner.lock() {
        if !operation_matches(&inner, &work.operation_id, &work.cancel) {
            return;
        }
        if work.cancel.load(Ordering::Relaxed) {
            inner.is_starting = false;
            inner.status.phase = ClassroomSyncPhase::Cancelled;
            inner.status.error_code = Some("CANCELLED".to_owned());
            inner.status.message = Some("Classroom sync was cancelled.".to_owned());
        } else {
            inner.status.phase = ClassroomSyncPhase::Error;
            inner.status.error_code = Some(error.code.to_owned());
            inner.status.message = Some(error.message.clone());
        }
        restore_local_snapshot_state(&mut inner.status);
        inner.operation = None;
    }
}

fn record_worker_join_failure(
    manager: &ClassroomManager,
    operation_id: &str,
    cancel: &Arc<AtomicBool>,
    error: &ClassroomCommandError,
) {
    let operation = if let Ok(mut inner) = manager.inner.lock() {
        if !operation_matches(&inner, operation_id, cancel) {
            return;
        }
        inner.status.phase = ClassroomSyncPhase::Error;
        inner.status.error_code = Some(error.code.to_owned());
        inner.status.message = Some(error.message.clone());
        inner.operation.clone()
    } else {
        None
    };
    if let Some(operation) = operation {
        operation.cancel.store(true, Ordering::Relaxed);
        if let Err(cleanup_error) = stop_and_cleanup(&operation) {
            if let Ok(mut inner) = manager.inner.lock() {
                inner.status.phase = ClassroomSyncPhase::Error;
                inner.status.error_code = Some(cleanup_error.code.to_owned());
                inner.status.message = Some(cleanup_error.message);
            }
        } else if let Ok(mut inner) = manager.inner.lock() {
            if operation_matches(&inner, operation_id, cancel) {
                inner.operation = None;
            }
        }
    }
}

fn is_valid_source_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
}

fn is_valid_required_text(value: &str, maximum: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= maximum
}

fn canonical_course(course: ExtractedCourse) -> Option<(String, ClassroomCourse)> {
    if !is_valid_required_text(&course.title, MAX_TITLE_LENGTH) {
        return None;
    }
    let url = Url::parse(&course.url).ok()?;
    if url.scheme() != "https"
        || url.host_str() != Some("classroom.google.com")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    let segments: Vec<_> = url.path_segments()?.collect();
    if segments.len() != 2 || segments[0] != "c" || !is_valid_source_id(segments[1]) {
        return None;
    }
    let source_id = segments[1].to_owned();
    let course = ClassroomCourse {
        id: stable_id("course", &[&source_id]),
        title: course.title.trim().to_owned(),
        url: format!("https://classroom.google.com/c/{source_id}"),
    };
    Some((source_id, course))
}

fn canonical_item_identity(
    value: &str,
    expected_course_source_id: &str,
) -> Option<(String, ClassroomItemKind, String)> {
    let url = Url::parse(value).ok()?;
    if url.scheme() != "https"
        || url.host_str() != Some("classroom.google.com")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    let segments: Vec<_> = url.path_segments()?.collect();
    let has_details_suffix = segments.len() == 5 && segments[4] == "details";
    if !(segments.len() == 4 || has_details_suffix)
        || segments[0] != "c"
        || segments[1] != expected_course_source_id
        || !is_valid_source_id(segments[3])
    {
        return None;
    }
    let kind = match segments[2] {
        "a" | "sa" => ClassroomItemKind::Assignment,
        "m" => ClassroomItemKind::Material,
        "p" => ClassroomItemKind::Announcement,
        "q" => ClassroomItemKind::Question,
        _ => return None,
    };
    let id = stable_id("item", &[expected_course_source_id, segments[3]]);
    let details_suffix = if has_details_suffix { "/details" } else { "" };
    let canonical_url = format!(
        "https://classroom.google.com/c/{expected_course_source_id}/{}/{}{details_suffix}",
        segments[2], segments[3]
    );
    Some((id, kind, canonical_url))
}

fn canonical_attachment_kind(url: &Url) -> Option<ClassroomAttachmentKind> {
    match url.host_str()? {
        "drive.google.com" => Some(ClassroomAttachmentKind::DriveFile),
        "docs.google.com" if url.path().starts_with("/document/") => {
            Some(ClassroomAttachmentKind::Document)
        }
        "docs.google.com" if url.path().starts_with("/spreadsheets/") => {
            Some(ClassroomAttachmentKind::Spreadsheet)
        }
        "docs.google.com" if url.path().starts_with("/presentation/") => {
            Some(ClassroomAttachmentKind::Presentation)
        }
        "docs.google.com" => Some(ClassroomAttachmentKind::Link),
        _ => None,
    }
}

fn attachment_source_id(url: &Url) -> String {
    let segments: Vec<_> = url
        .path_segments()
        .map(Iterator::collect)
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
        .unwrap_or_else(|| stable_id("link", &[url.as_str()]))
}

fn canonical_attachment(attachment: ExtractedAttachment) -> Option<ClassroomAttachment> {
    if !is_valid_required_text(&attachment.name, MAX_TITLE_LENGTH) {
        return None;
    }
    let mut url = Url::parse(&attachment.url).ok()?;
    if url.scheme() != "https"
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    let kind = canonical_attachment_kind(&url)?;
    let mut normalized_path = url.path().to_owned();
    while normalized_path.contains("//") {
        normalized_path = normalized_path.replace("//", "/");
    }
    if normalized_path.len() > 1 {
        normalized_path = normalized_path.trim_end_matches('/').to_owned();
    }
    url.set_path(&normalized_path);
    let canonical_url = url.to_string();
    let hostname = url.host_str()?;
    let source_id = attachment_source_id(&url);
    Some(ClassroomAttachment {
        id: stable_id("attachment", &[hostname, &source_id]),
        name: attachment.name.trim().to_owned(),
        url: canonical_url,
        kind,
    })
}

fn canonical_submission(submission: Option<ExtractedSubmission>) -> Option<ClassroomSubmission> {
    submission.map(|submission| {
        let grade = submission
            .grade
            .filter(|value| value.is_finite() && *value >= 0.0 && *value <= 1_000_000.0);
        let max_points = submission
            .max_points
            .filter(|value| value.is_finite() && *value >= 0.0 && *value <= 1_000_000.0);
        ClassroomSubmission {
            status: match submission.status.as_str() {
                "assigned" => ClassroomSubmissionStatus::Assigned,
                "turned-in" => ClassroomSubmissionStatus::TurnedIn,
                "returned" => ClassroomSubmissionStatus::Returned,
                "missing" => ClassroomSubmissionStatus::Missing,
                "graded" => ClassroomSubmissionStatus::Graded,
                _ => ClassroomSubmissionStatus::Unknown,
            },
            grade,
            max_points,
        }
    })
}

fn canonical_timestamp(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        chrono::DateTime::parse_from_rfc3339(value.trim())
            .ok()
            .map(|timestamp| timestamp.with_timezone(&Utc).to_rfc3339())
    })
}

fn canonical_item(
    item: ExtractedItem,
    course_source_id: &str,
    course_id: &str,
) -> Option<(ClassroomItem, bool)> {
    if !is_valid_required_text(&item.title, MAX_TITLE_LENGTH) {
        return None;
    }
    let (id, kind, url) = canonical_item_identity(&item.url, course_source_id)?;
    let extracted_attachment_count = item.attachments.len();
    let attachments = item
        .attachments
        .into_iter()
        .filter_map(canonical_attachment)
        .fold(BTreeMap::new(), |mut attachments, attachment| {
            if attachments.len() < MAX_ATTACHMENTS_PER_ITEM {
                attachments
                    .entry(attachment.id.clone())
                    .or_insert(attachment);
            }
            attachments
        });
    let attachments_were_rejected = extracted_attachment_count != attachments.len();
    let description = item.description.and_then(|description| {
        let trimmed = description.trim();
        if trimmed.is_empty() || trimmed.chars().count() > MAX_DESCRIPTION_LENGTH {
            None
        } else {
            Some(trimmed.to_owned())
        }
    });
    Some((
        ClassroomItem {
            id,
            course_id: course_id.to_owned(),
            kind,
            title: item.title.trim().to_owned(),
            url,
            description,
            posted_at: canonical_timestamp(item.posted_at),
            due_at: canonical_timestamp(item.due_at),
            submission: canonical_submission(item.submission),
            attachments: attachments.into_values().collect(),
        },
        attachments_were_rejected,
    ))
}

fn collect_page_items(
    items: &mut BTreeMap<String, ClassroomItem>,
    page_items: Vec<ExtractedItem>,
    course_source_id: &str,
    course_id: &str,
) -> bool {
    let mut was_truncated = false;
    for item in page_items {
        if items.len() >= MAX_ITEMS {
            was_truncated = true;
            break;
        }
        if let Some((item, attachments_were_rejected)) =
            canonical_item(item, course_source_id, course_id)
        {
            was_truncated |= attachments_were_rejected;
            items.entry(item.id.clone()).or_insert(item);
        } else {
            was_truncated = true;
        }
    }
    was_truncated
}

fn classroom_counts(courses: usize, items: &[ClassroomItem]) -> ClassroomCounts {
    let mut counts = ClassroomCounts {
        courses,
        items: items.len(),
        attachments: 0,
        assigned: 0,
        turned_in: 0,
        returned: 0,
        missing: 0,
        graded: 0,
    };
    for item in items {
        counts.attachments += item.attachments.len();
        match item.submission.as_ref().map(|submission| submission.status) {
            Some(ClassroomSubmissionStatus::Assigned) => counts.assigned += 1,
            Some(ClassroomSubmissionStatus::TurnedIn) => counts.turned_in += 1,
            Some(ClassroomSubmissionStatus::Returned) => counts.returned += 1,
            Some(ClassroomSubmissionStatus::Missing) => counts.missing += 1,
            Some(ClassroomSubmissionStatus::Graded) => counts.graded += 1,
            Some(ClassroomSubmissionStatus::Unknown) | None => {}
        }
    }
    counts
}

fn cancelled(work: &SyncWork) -> Result<(), ClassroomCommandError> {
    if work.cancel.load(Ordering::Relaxed) {
        Err(ClassroomCommandError::new(
            "CANCELLED",
            "Classroom sync was cancelled.",
            false,
        ))
    } else {
        Ok(())
    }
}

fn run_sync(
    manager: ClassroomManager,
    cache: SecureCacheState,
    work: SyncWork,
) -> Result<ClassroomSyncStatus, ClassroomCommandError> {
    let result = (|| {
        cancelled(&work)?;
        let mut cdp = cdp::connect_classroom_page(work.port, &work.cancel)?;
        cdp.navigate("https://classroom.google.com/", &work.cancel)?;
        let mut home = cdp.extract(&work.cancel)?;
        // Classroom occasionally finishes its first paint with the course list still empty — a
        // cold profile right after sign-in is the common case. One more navigate-and-read costs a
        // few seconds and is far better than failing the whole sync as unverified.
        if home.courses.is_empty() && !home.empty_state_observed {
            cancelled(&work)?;
            cdp.navigate("https://classroom.google.com/", &work.cancel)?;
            home = cdp.extract(&work.cancel)?;
        }
        let ExtractedPage {
            courses: extracted_courses,
            empty_state_observed,
            reached_page_end,
            page_content_observed,
            course_limit_reached,
            item_limit_reached,
            attachment_limit_reached,
            account_hint,
            ..
        } = home;
        let course_input_was_truncated =
            course_limit_reached || extracted_courses.len() > MAX_COURSES;
        let mut course_input_was_rejected = false;
        let mut course_map = BTreeMap::new();
        for course in extracted_courses.into_iter().take(MAX_COURSES) {
            if let Some((source_id, course)) = canonical_course(course) {
                course_map.entry(source_id).or_insert(course);
            } else {
                course_input_was_rejected = true;
            }
        }
        if course_map.is_empty() && !empty_state_observed {
            return Err(ClassroomCommandError::new(
                "UNVERIFIED_EMPTY_CLASSROOM_DATA",
                "No course cards were found and Classroom did not show an explicit empty-state marker. Check that the visible browser is signed in to the right Google account and that its Classroom home lists your classes, then sync again.",
                true,
            ));
        }

        let mut issues = Vec::new();
        if !reached_page_end {
            issues.push(
                "The course list did not reach a verified end during the bounded scan.".to_owned(),
            );
        }
        if !page_content_observed {
            issues.push(
                "The Classroom course list did not expose stable rendered content.".to_owned(),
            );
        }
        if course_input_was_truncated {
            issues.push("The course limit was reached during the bounded scan.".to_owned());
        }
        if course_input_was_rejected {
            issues.push("One or more extracted courses failed canonical validation.".to_owned());
        }
        if item_limit_reached || attachment_limit_reached {
            issues
                .push("The Classroom record limit was reached during the bounded scan.".to_owned());
        }
        let mut items = BTreeMap::new();
        let mut course_pages_visited = 0;
        let mut course_pages_failed = 0;

        for (course_source_id, course) in &course_map {
            cancelled(&work)?;
            let mut course_succeeded = true;
            match cdp
                .navigate(course.url.as_str(), &work.cancel)
                .and_then(|_| cdp.extract(&work.cancel))
            {
                Ok(page) => {
                    let rust_limit_reached =
                        collect_page_items(&mut items, page.items, course_source_id, &course.id);
                    if !page.reached_page_end
                        || !page.page_content_observed
                        || page.course_limit_reached
                        || page.item_limit_reached
                        || page.attachment_limit_reached
                        || rust_limit_reached
                    {
                        course_succeeded = false;
                    }
                }
                Err(error) if error.code == "LOGIN_REQUIRED" || error.code == "CANCELLED" => {
                    return Err(error)
                }
                Err(_) => course_succeeded = false,
            }

            let current_classwork_url =
                format!("https://classroom.google.com/c/{course_source_id}/a/all");
            let legacy_classwork_url =
                format!("https://classroom.google.com/w/{course_source_id}/t/all");
            let mut classwork_succeeded = false;
            for page_url in [
                current_classwork_url.as_str(),
                legacy_classwork_url.as_str(),
            ] {
                match cdp
                    .navigate(page_url, &work.cancel)
                    .and_then(|_| cdp.extract(&work.cancel))
                {
                    Ok(page) => {
                        let rust_limit_reached = collect_page_items(
                            &mut items,
                            page.items,
                            course_source_id,
                            &course.id,
                        );
                        classwork_succeeded = page.reached_page_end
                            && page.page_content_observed
                            && !page.course_limit_reached
                            && !page.item_limit_reached
                            && !page.attachment_limit_reached
                            && !rust_limit_reached;
                        break;
                    }
                    Err(error) if error.code == "LOGIN_REQUIRED" || error.code == "CANCELLED" => {
                        return Err(error)
                    }
                    Err(_) => {}
                }
            }
            course_succeeded &= classwork_succeeded;
            if course_succeeded {
                course_pages_visited += 1;
            } else {
                course_pages_failed += 1;
                if issues.len() < MAX_ISSUES {
                    issues.push(format!(
                        "Course {course_source_id} was only partially scanned."
                    ));
                }
            }
        }

        let courses: Vec<ClassroomCourse> = course_map.into_values().collect();
        let items: Vec<ClassroomItem> = items.into_values().collect();
        let course_list_complete =
            reached_page_end && !course_input_was_truncated && !course_input_was_rejected;
        let is_verified_empty = courses.is_empty()
            && items.is_empty()
            && empty_state_observed
            && course_list_complete
            && issues.is_empty();
        let is_complete = !courses.is_empty()
            && course_list_complete
            && course_pages_visited == courses.len()
            && course_pages_failed == 0
            && issues.is_empty();
        let integrity = if is_verified_empty {
            ClassroomSnapshotIntegrity::VerifiedEmpty
        } else if is_complete {
            ClassroomSnapshotIntegrity::Complete
        } else {
            ClassroomSnapshotIntegrity::Partial
        };
        let counts = classroom_counts(courses.len(), &items);
        let snapshot = DesktopClassroomSnapshot {
            owner_id: work.owner_id.clone(),
            version: 1,
            coverage: ClassroomCoverage {
                course_list_visited: true,
                course_list_complete,
                empty_state_observed,
                courses_observed: courses.len(),
                course_pages_visited,
                course_pages_failed,
                issues,
            },
            sync: ClassroomSyncMetadata {
                source: "desktop-browser",
                extractor_version: EXTRACTOR_VERSION,
                synced_at: Utc::now().to_rfc3339(),
                account_hint: account_hint.filter(|hint| {
                    !hint.trim().is_empty() && hint.chars().count() <= MAX_ACCOUNT_HINT_LENGTH
                }),
                integrity,
                counts,
            },
            courses,
            items,
        };

        {
            let mut inner = manager.inner.lock().map_err(|_| lock_error())?;
            if !operation_matches(&inner, &work.operation_id, &work.cancel) {
                return Err(ClassroomCommandError::new(
                    "CANCELLED",
                    "Classroom sync was cancelled.",
                    false,
                ));
            }
            inner.status.phase = ClassroomSyncPhase::SavingLocally;
            inner.status.courses_found = snapshot.courses.len() as u32;
            inner.status.items_found = snapshot.items.len() as u32;
            inner.status.local_snapshot_state = ClassroomLocalSnapshotState::Saving;
            inner.status.message =
                Some("Saving the encrypted Classroom snapshot on this device.".to_owned());
        }

        let snapshot_value = serde_json::to_value(&snapshot).map_err(|_| {
            ClassroomCommandError::new(
                "LOCAL_SAVE_FAILED",
                "The Classroom snapshot could not be prepared for encrypted local storage.",
                true,
            )
        })?;
        let write_outcome =
            secure_cache::save_classroom_snapshot(&cache, &work.owner_id, &snapshot_value)
                .map_err(cache_error)?;

        let mut inner = manager.inner.lock().map_err(|_| lock_error())?;
        if !operation_matches(&inner, &work.operation_id, &work.cancel) {
            return Ok(inner.status.clone());
        }
        inner.status.phase = if integrity == ClassroomSnapshotIntegrity::Partial {
            ClassroomSyncPhase::Partial
        } else {
            ClassroomSyncPhase::Completed
        };
        inner.status.local_snapshot_available = Some(true);
        inner.status.local_snapshot_state = match write_outcome {
            ClassroomSnapshotWriteOutcome::Written => ClassroomLocalSnapshotState::Saved,
            ClassroomSnapshotWriteOutcome::Preserved => ClassroomLocalSnapshotState::Preserved,
        };
        inner.status.error_code = None;
        inner.status.message = Some(match (integrity, write_outcome) {
            (ClassroomSnapshotIntegrity::Partial, ClassroomSnapshotWriteOutcome::Written) => {
                "Partial Classroom data was saved on this device. Complete cloud data was preserved."
                    .to_owned()
            }
            (ClassroomSnapshotIntegrity::Partial, ClassroomSnapshotWriteOutcome::Preserved) => {
                "The partial scan finished; a newer or more complete saved snapshot was preserved."
                    .to_owned()
            }
            (_, ClassroomSnapshotWriteOutcome::Written) => {
                "Classroom data was saved on this device and is ready for cloud sync.".to_owned()
            }
            (_, ClassroomSnapshotWriteOutcome::Preserved) => {
                "The scan finished; a newer saved Classroom snapshot was preserved for cloud sync."
                    .to_owned()
            }
        });
        Ok(inner.status.clone())
    })();

    let is_login_retry = result
        .as_ref()
        .err()
        .is_some_and(|error| error.code == "LOGIN_REQUIRED")
        && !work.cancel.load(Ordering::Relaxed);
    if is_login_retry {
        if let Ok(mut inner) = manager.inner.lock() {
            if operation_matches(&inner, &work.operation_id, &work.cancel) {
                inner.status.phase = ClassroomSyncPhase::AwaitingLogin;
                inner.status.error_code = Some("LOGIN_REQUIRED".to_owned());
                inner.status.message = Some(
                    "Complete Google sign-in in the visible browser, then confirm again."
                        .to_owned(),
                );
                return result;
            }
        }
    }
    if let Err(cleanup_error) = stop_work(&work) {
        if let Ok(mut inner) = manager.inner.lock() {
            if inner.status.operation_id.as_deref() == Some(work.operation_id.as_str()) {
                inner.status.phase = ClassroomSyncPhase::Error;
                inner.status.error_code = Some(cleanup_error.code.to_owned());
                inner.status.message = Some(match &result {
                    Err(sync_error) => format!(
                        "{} The temporary browser profile also could not be cleaned up: {}",
                        sync_error.message, cleanup_error.message
                    ),
                    Ok(_) => cleanup_error.message.clone(),
                });
                restore_local_snapshot_state(&mut inner.status);
            }
        }
        return Err(cleanup_error);
    }
    if let Err(error) = &result {
        fail_status(&manager, &work, error);
    } else if let Ok(mut inner) = manager.inner.lock() {
        if operation_matches(&inner, &work.operation_id, &work.cancel) {
            inner.operation = None;
        }
    }
    result
}

pub fn cleanup_stale_profiles(app: &AppHandle) -> Result<(), ClassroomCommandError> {
    browser::cleanup_stale_temporary_profiles(app)
}

/// Clears the download quarantine flag from Millennium's own installed bundle.
///
/// Called once during startup. Ad-hoc signed builds cannot be notarised, and a quarantined copy
/// never reaches the macOS browser automation prompt. See `browser::clear_own_quarantine_flag`.
pub fn clear_install_quarantine_flag() {
    browser::clear_own_quarantine_flag();
}

#[tauri::command]
pub fn detect_classroom_browsers(
    window: WebviewWindow,
    cache_state: State<'_, SecureCacheState>,
) -> Result<Vec<ClassroomBrowser>, ClassroomCommandError> {
    approved_caller(&window, cache_state.inner())?;
    Ok(browser::detect_browsers())
}

#[tauri::command]
pub async fn get_classroom_browser_permission(
    window: WebviewWindow,
    cache_state: State<'_, SecureCacheState>,
    browser_id: String,
) -> Result<ClassroomBrowserPermission, ClassroomCommandError> {
    approved_caller(&window, cache_state.inner())?;
    browser::detected_browser(&browser_id)?;
    tauri::async_runtime::spawn_blocking(move || browser::browser_permission_status(&browser_id))
        .await
        .map_err(|_| {
            ClassroomCommandError::new(
                "BROWSER_PERMISSION_UNAVAILABLE",
                "Browser permission status could not be checked.",
                true,
            )
        })?
}

#[tauri::command]
pub async fn request_classroom_browser_permission(
    window: WebviewWindow,
    cache_state: State<'_, SecureCacheState>,
    browser_id: String,
) -> Result<ClassroomBrowserPermission, ClassroomCommandError> {
    approved_caller(&window, cache_state.inner())?;
    browser::detected_browser(&browser_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        browser::request_automation_permission(&browser_id)
    })
    .await
    .map_err(|_| {
        ClassroomCommandError::new(
            "BROWSER_PERMISSION_UNAVAILABLE",
            "macOS browser permission request stopped unexpectedly.",
            true,
        )
    })?
}

/// Reports why macOS has not granted browser automation access yet.
///
/// Ad-hoc signed builds cannot be notarised, so the usual failure is environmental rather than a
/// user decision: a quarantined or translocated copy never reaches the prompt, and Privacy &
/// Security > Automation offers no way to add the entry by hand. The dialog needs the specific
/// blocker to show a recovery step that actually works.
#[tauri::command]
pub async fn get_classroom_automation_diagnostics(
    app: AppHandle,
    window: WebviewWindow,
    cache_state: State<'_, SecureCacheState>,
    browser_id: String,
) -> Result<ClassroomAutomationDiagnostics, ClassroomCommandError> {
    approved_caller(&window, cache_state.inner())?;
    let bundle_identifier = app.config().identifier.clone();
    tauri::async_runtime::spawn_blocking(move || {
        browser::automation_diagnostics(&browser_id, &bundle_identifier)
    })
    .await
    .map_err(|_| {
        ClassroomCommandError::new(
            "BROWSER_PERMISSION_UNAVAILABLE",
            "Browser permission diagnostics stopped unexpectedly.",
            true,
        )
    })?
}

/// Clears the quarantine flag on Millennium's own bundle and resets its stored automation decision
/// so macOS presents the prompt again. Scoped to this application only.
#[tauri::command]
pub async fn repair_classroom_automation(
    app: AppHandle,
    window: WebviewWindow,
    cache_state: State<'_, SecureCacheState>,
    browser_id: String,
) -> Result<ClassroomAutomationRepair, ClassroomCommandError> {
    approved_caller(&window, cache_state.inner())?;
    browser::detected_browser(&browser_id)?;
    let bundle_identifier = app.config().identifier.clone();
    tauri::async_runtime::spawn_blocking(move || {
        browser::repair_automation_permission(&browser_id, &bundle_identifier)
    })
    .await
    .map_err(|_| {
        ClassroomCommandError::new(
            "BROWSER_PERMISSION_REPAIR_FAILED",
            "The browser permission repair stopped unexpectedly.",
            true,
        )
    })?
}

/// Opens the operating-system privacy pane that owns browser automation access.
///
/// macOS shows its automation prompt at most once per application and target. After a denial the
/// only way to grant access is System Settings, so the in-app dialog must be able to take the
/// user there instead of asking again and appearing to do nothing.
#[tauri::command]
pub async fn open_browser_permission_settings(
    window: WebviewWindow,
    cache_state: State<'_, SecureCacheState>,
) -> Result<(), ClassroomCommandError> {
    approved_caller(&window, cache_state.inner())?;
    browser::open_automation_settings()
}

fn record_start_failure(
    manager: &ClassroomManager,
    operation_id: &str,
    cancel: &Arc<AtomicBool>,
    delete_profile: &Arc<AtomicBool>,
    error: &ClassroomCommandError,
) {
    let operation = if let Ok(mut inner) = manager.inner.lock() {
        let owns_start = inner
            .starting_cancel
            .as_ref()
            .is_some_and(|active| Arc::ptr_eq(active, cancel));
        if !owns_start && !operation_matches(&inner, operation_id, cancel) {
            return;
        }
        let operation = inner.operation.clone();
        let should_preserve_cleanup_error =
            matches!(&inner.status.phase, ClassroomSyncPhase::Error) && error.code == "CANCELLED";
        if !should_preserve_cleanup_error {
            if cancel.load(Ordering::Relaxed) && error.code == "CANCELLED" {
                inner.status.phase = ClassroomSyncPhase::Cancelled;
                inner.status.error_code = Some("CANCELLED".to_owned());
                inner.status.message = Some("Classroom sync was cancelled.".to_owned());
            } else {
                inner.status.phase = ClassroomSyncPhase::Error;
                inner.status.error_code = Some(error.code.to_owned());
                inner.status.message = Some(error.message.clone());
            }
        }
        if operation.is_none() {
            inner.is_starting = false;
            inner.starting_cancel = None;
            inner.starting_delete_profile = None;
        }
        operation
    } else {
        None
    };
    if let Some(operation) = operation {
        operation.cancel.store(true, Ordering::Relaxed);
        let cleanup_result = stop_and_cleanup(&operation).and_then(|_| {
            if delete_profile.load(Ordering::Relaxed) {
                browser::remove_owned_profile(&operation.profile_path)
            } else {
                Ok(())
            }
        });
        if let Err(cleanup_error) = cleanup_result {
            if let Ok(mut inner) = manager.inner.lock() {
                inner.status.phase = ClassroomSyncPhase::Error;
                inner.status.error_code = Some(cleanup_error.code.to_owned());
                inner.status.message = Some(cleanup_error.message);
            }
        } else if let Ok(mut inner) = manager.inner.lock() {
            let owns_start = inner
                .starting_cancel
                .as_ref()
                .is_some_and(|active| Arc::ptr_eq(active, cancel));
            if owns_start || operation_matches(&inner, operation_id, cancel) {
                inner.is_starting = false;
                inner.starting_cancel = None;
                inner.starting_delete_profile = None;
                inner.operation = None;
            }
        }
    }
}

fn finish_prelaunch_abort(
    manager: &ClassroomManager,
    cancel: &Arc<AtomicBool>,
    app: &AppHandle,
    owner_id: &str,
    delete_profile: &AtomicBool,
    mut error: ClassroomCommandError,
) -> ClassroomCommandError {
    let should_delete_profile = if let Ok(mut inner) = manager.inner.lock() {
        let owns_start = inner
            .starting_cancel
            .as_ref()
            .is_some_and(|active| Arc::ptr_eq(active, cancel));
        if !owns_start {
            return error;
        }
        let should_delete = delete_profile.load(Ordering::Relaxed);
        inner.is_starting = false;
        inner.starting_cancel = None;
        inner.starting_delete_profile = None;
        inner.is_cache_mutating = should_delete;
        should_delete
    } else {
        delete_profile.load(Ordering::Relaxed)
    };

    if should_delete_profile {
        match remove_requested_persistent_profile(app, owner_id, delete_profile) {
            Ok(true) if error.code == "CANCELLED" => {
                error.message =
                    "Classroom sync was cancelled and the dedicated browser profile was removed."
                        .to_owned();
            }
            Ok(_) => {}
            Err(cleanup_error) => error = cleanup_error,
        }
    }

    if let Ok(mut inner) = manager.inner.lock() {
        inner.is_cache_mutating = false;
        if error.code == "CANCELLED" {
            inner.status.phase = ClassroomSyncPhase::Cancelled;
            inner.status.error_code = Some("CANCELLED".to_owned());
        } else {
            inner.status.phase = ClassroomSyncPhase::Error;
            inner.status.error_code = Some(error.code.to_owned());
        }
        inner.status.message = Some(error.message.clone());
    }
    error
}

#[tauri::command]
pub async fn start_classroom_sync(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, ClassroomManager>,
    cache_state: State<'_, SecureCacheState>,
    request: StartClassroomSyncInput,
) -> Result<ClassroomSyncStatus, ClassroomCommandError> {
    approved_caller(&window, cache_state.inner())?;
    let detected = browser::detected_browser(&request.browser_id)?;
    let browser = detected.descriptor.clone();
    let operation_id = generate_operation_id()?;
    let cancel = Arc::new(AtomicBool::new(false));
    let start_cancel = cancel.clone();
    let delete_profile = Arc::new(AtomicBool::new(false));
    let start_delete_profile = delete_profile.clone();
    let worker_operation_id = operation_id.clone();
    let manager = state.inner().clone();

    {
        let mut inner = manager.inner.lock().map_err(|_| lock_error())?;
        if inner.is_cache_mutating {
            return Err(ClassroomCommandError::new(
                "LOCAL_CACHE_OPERATION_ACTIVE",
                "Classroom sync cannot start while local account data is being changed.",
                true,
            ));
        }
        if inner.operation.is_some() || inner.is_starting {
            return Err(ClassroomCommandError::new(
                "OPERATION_ALREADY_ACTIVE",
                "A Classroom browser sync is already active.",
                true,
            ));
        }
        inner.is_starting = true;
        inner.starting_cancel = Some(cancel.clone());
        inner.starting_delete_profile = Some(delete_profile.clone());
        inner.status = ClassroomSyncStatus {
            phase: ClassroomSyncPhase::Launching,
            operation_id: Some(operation_id.clone()),
            browser: Some(browser.clone()),
            keep_signed_in: request.keep_signed_in,
            courses_found: 0,
            items_found: 0,
            local_snapshot_available: None,
            local_snapshot_state: ClassroomLocalSnapshotState::Unknown,
            cloud_sync_state: models::ClassroomCloudSyncState::Deferred,
            error_code: None,
            message: Some(
                "Launching a visible browser with a dedicated Classroom profile.".to_owned(),
            ),
        };
    }

    let local_snapshot_available = match secure_cache::classroom_snapshot_available_for_sync(
        cache_state.inner(),
        &request.owner_id,
    ) {
        Ok(is_available) => is_available,
        Err(error) => {
            let error = finish_prelaunch_abort(
                &manager,
                &cancel,
                &app,
                &request.owner_id,
                &delete_profile,
                cache_error(error),
            );
            return Err(error);
        }
    };
    let should_cancel_before_launch = {
        let mut inner = manager.inner.lock().map_err(|_| lock_error())?;
        let owns_start = inner
            .starting_cancel
            .as_ref()
            .is_some_and(|active| Arc::ptr_eq(active, &cancel));
        if !owns_start || cancel.load(Ordering::Relaxed) {
            true
        } else {
            inner.status.local_snapshot_available = Some(local_snapshot_available);
            inner.status.local_snapshot_state = if local_snapshot_available {
                ClassroomLocalSnapshotState::Existing
            } else {
                ClassroomLocalSnapshotState::Missing
            };
            false
        }
    };
    if should_cancel_before_launch {
        let cancellation_error = finish_prelaunch_abort(
            &manager,
            &cancel,
            &app,
            &request.owner_id,
            &delete_profile,
            ClassroomCommandError::new("CANCELLED", "Classroom sync was cancelled.", false),
        );
        return Err(cancellation_error);
    }

    let worker_manager = manager.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let profile_path = browser::profile_path(
            &app,
            &worker_operation_id,
            &request.owner_id,
            request.keep_signed_in,
        )?;
        if cancel.load(Ordering::Relaxed) {
            if !request.keep_signed_in || delete_profile.load(Ordering::Relaxed) {
                browser::remove_owned_profile(&profile_path)?;
            }
            return Err(ClassroomCommandError::new(
                "CANCELLED",
                "Classroom sync was cancelled.",
                false,
            ));
        }
        let child = match browser::launch_browser(&detected, &profile_path) {
            Ok(child) => child,
            Err(error) => {
                if !request.keep_signed_in || delete_profile.load(Ordering::Relaxed) {
                    browser::remove_owned_profile(&profile_path)?;
                }
                return Err(error);
            }
        };
        let child = Arc::new(Mutex::new(child));
        {
            let mut inner = worker_manager.inner.lock().map_err(|_| lock_error())?;
            let owns_start = inner
                .starting_cancel
                .as_ref()
                .is_some_and(|active| Arc::ptr_eq(active, &cancel));
            inner.operation = Some(ActiveOperation {
                operation_id: worker_operation_id.clone(),
                owner_id: request.owner_id.clone(),
                browser_id: request.browser_id.clone(),
                child: child.clone(),
                cancel: cancel.clone(),
                profile_path: profile_path.clone(),
                keep_signed_in: request.keep_signed_in,
                port: None,
            });
            if !owns_start || cancel.load(Ordering::Relaxed) {
                return Err(ClassroomCommandError::new(
                    "CANCELLED",
                    "Classroom sync was cancelled.",
                    false,
                ));
            }
        }

        let port = cdp::wait_for_devtools_port(&profile_path, &child, &cancel)?;
        let status = ClassroomSyncStatus {
            phase: ClassroomSyncPhase::AwaitingLogin,
            operation_id: Some(worker_operation_id.clone()),
            browser: Some(browser),
            keep_signed_in: request.keep_signed_in,
            courses_found: 0,
            items_found: 0,
            local_snapshot_available: Some(local_snapshot_available),
            local_snapshot_state: if local_snapshot_available {
                ClassroomLocalSnapshotState::Existing
            } else {
                ClassroomLocalSnapshotState::Missing
            },
            cloud_sync_state: models::ClassroomCloudSyncState::Deferred,
            error_code: None,
            message: Some(
                "Complete Google sign-in in the visible browser, then confirm to sync.".to_owned(),
            ),
        };
        let mut inner = worker_manager.inner.lock().map_err(|_| lock_error())?;
        if cancel.load(Ordering::Relaxed)
            || !operation_matches(&inner, &worker_operation_id, &cancel)
        {
            return Err(ClassroomCommandError::new(
                "CANCELLED",
                "Classroom sync was cancelled.",
                false,
            ));
        }
        if let Some(operation) = inner.operation.as_mut() {
            operation.port = Some(port);
        }
        inner.is_starting = false;
        inner.starting_cancel = None;
        inner.starting_delete_profile = None;
        inner.status = status.clone();
        Ok(status)
    })
    .await;

    match result {
        Ok(Ok(status)) => Ok(status),
        Ok(Err(error)) => {
            record_start_failure(
                &manager,
                &operation_id,
                &start_cancel,
                &start_delete_profile,
                &error,
            );
            Err(error)
        }
        Err(_) => {
            let error = ClassroomCommandError::new(
                "SYNC_WORKER_FAILED",
                "The Classroom browser launch worker stopped unexpectedly.",
                true,
            );
            record_start_failure(
                &manager,
                &operation_id,
                &start_cancel,
                &start_delete_profile,
                &error,
            );
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn continue_classroom_sync(
    window: WebviewWindow,
    state: State<'_, ClassroomManager>,
    cache_state: State<'_, SecureCacheState>,
) -> Result<ClassroomSyncStatus, ClassroomCommandError> {
    approved_caller(&window, cache_state.inner())?;
    let manager = state.inner().clone();
    let cache = cache_state.inner().clone();

    // Reading Classroom pages is only allowed once the operating system itself has confirmed
    // automation access for the dedicated browser. The renderer cannot bypass this by skipping
    // its own consent dialog.
    let pending_browser_id = {
        let inner = manager.inner.lock().map_err(|_| lock_error())?;
        inner
            .operation
            .as_ref()
            .map(|operation| operation.browser_id.clone())
    };
    if let Some(browser_id) = pending_browser_id {
        let permission = tauri::async_runtime::spawn_blocking(move || {
            browser::browser_permission_status_for_read(&browser_id)
        })
        .await
                .map_err(|_| {
                    ClassroomCommandError::new(
                        "BROWSER_PERMISSION_UNAVAILABLE",
                        "Browser permission status could not be checked.",
                        true,
                    )
                })??;
        if !permission.allows_reading() {
            return Err(ClassroomCommandError::new(
                "BROWSER_PERMISSION_REQUIRED",
                "Allow Millennium to control the selected browser before Classroom pages are read.",
                true,
            ));
        }
    }

    let work = {
        let mut inner = manager.inner.lock().map_err(|_| lock_error())?;
        if !matches!(&inner.status.phase, ClassroomSyncPhase::AwaitingLogin) {
            return Err(ClassroomCommandError::new(
                "USER_ACTION_REQUIRED",
                "Classroom sync is not waiting for login confirmation.",
                true,
            ));
        }
        let work = {
            let operation = inner.operation.as_ref().ok_or_else(|| {
                ClassroomCommandError::new(
                    "OPERATION_NOT_FOUND",
                    "No active Classroom sync is waiting for confirmation.",
                    true,
                )
            })?;
            let port = operation.port.ok_or_else(|| {
                ClassroomCommandError::new(
                    "USER_ACTION_REQUIRED",
                    "The visible browser is still launching.",
                    true,
                )
            })?;
            SyncWork {
                operation_id: operation.operation_id.clone(),
                owner_id: operation.owner_id.clone(),
                child: operation.child.clone(),
                cancel: operation.cancel.clone(),
                profile_path: operation.profile_path.clone(),
                keep_signed_in: operation.keep_signed_in,
                port,
            }
        };
        inner.status.phase = ClassroomSyncPhase::Scraping;
        inner.status.message = Some("Reading the visible Classroom pages.".to_owned());
        work
    };
    let operation_id = work.operation_id.clone();
    let worker_cancel = work.cancel.clone();
    let worker_manager = manager.clone();
    match tauri::async_runtime::spawn_blocking(move || run_sync(worker_manager, cache, work)).await
    {
        Ok(result) => result,
        Err(_) => {
            let error = ClassroomCommandError::new(
                "SYNC_WORKER_FAILED",
                "The Classroom sync worker stopped unexpectedly.",
                true,
            );
            record_worker_join_failure(&manager, &operation_id, &worker_cancel, &error);
            Err(error)
        }
    }
}

#[tauri::command]
pub fn get_classroom_sync_status(
    window: WebviewWindow,
    state: State<'_, ClassroomManager>,
    cache_state: State<'_, SecureCacheState>,
) -> Result<ClassroomSyncStatus, ClassroomCommandError> {
    approved_caller(&window, cache_state.inner())?;
    let inner = state.inner.lock().map_err(|_| lock_error())?;
    Ok(inner.status.clone())
}

#[tauri::command]
pub fn cancel_classroom_sync(
    window: WebviewWindow,
    state: State<'_, ClassroomManager>,
    cache_state: State<'_, SecureCacheState>,
) -> Result<ClassroomSyncStatus, ClassroomCommandError> {
    approved_caller(&window, cache_state.inner())?;
    let (operation, starting_cancel, status) = {
        let mut inner = state.inner.lock().map_err(|_| lock_error())?;
        if matches!(&inner.status.phase, ClassroomSyncPhase::SavingLocally) {
            inner.status.message = Some(
                "The encrypted local save is already in progress and cannot be cancelled safely."
                    .to_owned(),
            );
            return Ok(inner.status.clone());
        }
        if inner.operation.is_none() && !inner.is_starting {
            return Err(ClassroomCommandError::new(
                "OPERATION_NOT_FOUND",
                "No active Classroom sync is available to cancel.",
                true,
            ));
        }
        if !matches!(
            &inner.status.phase,
            ClassroomSyncPhase::Launching
                | ClassroomSyncPhase::AwaitingLogin
                | ClassroomSyncPhase::Scraping
        ) {
            return Err(ClassroomCommandError::new(
                "OPERATION_NOT_CANCELLABLE",
                "The active Classroom operation can no longer be cancelled.",
                false,
            ));
        }
        let was_starting = inner.is_starting;
        let operation = inner.operation.clone();
        let starting_cancel = if was_starting {
            inner.starting_cancel.clone()
        } else {
            inner.starting_delete_profile = None;
            inner.starting_cancel.take()
        };
        if !was_starting {
            inner.is_starting = false;
        }
        inner.status.phase = ClassroomSyncPhase::Cancelled;
        inner.status.error_code = Some("CANCELLED".to_owned());
        inner.status.message = Some("Classroom sync was cancelled.".to_owned());
        (operation, starting_cancel, inner.status.clone())
    };
    if let Some(cancel) = starting_cancel {
        cancel.store(true, Ordering::Relaxed);
    }
    if let Some(operation) = operation {
        operation.cancel.store(true, Ordering::Relaxed);
        if let Err(cleanup_error) = stop_and_cleanup(&operation) {
            if let Ok(mut inner) = state.inner.lock() {
                inner.status.phase = ClassroomSyncPhase::Error;
                inner.status.error_code = Some(cleanup_error.code.to_owned());
                inner.status.message = Some(cleanup_error.message.clone());
            }
            return Err(cleanup_error);
        }
        if let Ok(mut inner) = state.inner.lock() {
            if operation_matches(&inner, &operation.operation_id, &operation.cancel) {
                inner.operation = None;
            }
        }
    }
    Ok(status)
}

#[tauri::command]
pub fn disconnect_classroom(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, ClassroomManager>,
    cache_state: State<'_, SecureCacheState>,
    owner_id: String,
) -> Result<ClassroomSyncStatus, ClassroomCommandError> {
    approved_caller(&window, cache_state.inner())?;
    secure_cache::verify_active_owner(cache_state.inner(), &owner_id).map_err(cache_error)?;
    let (operation, starting_cancel, was_starting, local_snapshot_available) = {
        let mut inner = state.inner.lock().map_err(|_| lock_error())?;
        if inner.is_cache_mutating {
            return Err(ClassroomCommandError::new(
                "LOCAL_CACHE_OPERATION_ACTIVE",
                "Classroom cannot disconnect while local account data is being changed.",
                true,
            ));
        }
        if matches!(&inner.status.phase, ClassroomSyncPhase::SavingLocally) {
            return Err(ClassroomCommandError::new(
                "LOCAL_SAVE_IN_PROGRESS",
                "Wait for the encrypted local Classroom save to finish before disconnecting.",
                true,
            ));
        }
        let was_starting = inner.is_starting;
        if let Some(delete_profile) = inner.starting_delete_profile.as_ref() {
            delete_profile.store(true, Ordering::Relaxed);
        }
        let operation = inner.operation.clone();
        let starting_cancel = inner.starting_cancel.clone();
        inner.is_cache_mutating = true;
        inner.status.phase = ClassroomSyncPhase::Cancelled;
        inner.status.error_code = Some("CANCELLED".to_owned());
        inner.status.message =
            Some("Disconnecting the dedicated Classroom browser profile.".to_owned());
        (
            operation,
            starting_cancel,
            was_starting,
            inner.status.local_snapshot_available,
        )
    };
    if let Some(cancel) = starting_cancel {
        cancel.store(true, Ordering::Relaxed);
    }
    let had_operation = operation.is_some();
    if was_starting && !had_operation {
        let inner = state.inner.lock().map_err(|_| lock_error())?;
        return Ok(inner.status.clone());
    }

    let cleanup_result = (|| {
        if let Some(operation) = &operation {
            operation.cancel.store(true, Ordering::Relaxed);
            stop_and_cleanup(operation)?;
        }
        browser::remove_owned_profile(&browser::persistent_profile_path(&app, &owner_id)?)?;
        browser::remove_owned_profile(&browser::legacy_persistent_profile_path(&app)?)
    })();

    let mut inner = state.inner.lock().map_err(|_| lock_error())?;
    inner.is_cache_mutating = false;
    if let Err(error) = cleanup_result {
        inner.status.phase = ClassroomSyncPhase::Error;
        inner.status.error_code = Some(error.code.to_owned());
        inner.status.message = Some(error.message.clone());
        return Err(error);
    }
    inner.is_starting = false;
    inner.starting_cancel = None;
    inner.starting_delete_profile = None;
    inner.operation = None;
    inner.status = ClassroomSyncStatus::default();
    inner.status.local_snapshot_available = local_snapshot_available;
    inner.status.local_snapshot_state = match local_snapshot_available {
        Some(true) => ClassroomLocalSnapshotState::Existing,
        Some(false) => ClassroomLocalSnapshotState::Missing,
        None => ClassroomLocalSnapshotState::Unknown,
    };
    inner.status.message = Some(
        "The dedicated Classroom browser profile was disconnected. Saved Classroom data was not deleted."
            .to_owned(),
    );
    Ok(inner.status.clone())
}
