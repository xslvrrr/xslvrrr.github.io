use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomBrowser {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ClassroomBrowserPermission {
    #[cfg(not(target_os = "macos"))]
    NotRequired,
    PromptRequired,
    /// The operating system cannot present its prompt for this build, so access has to be granted
    /// from system settings instead.
    #[cfg(target_os = "macos")]
    PromptUnavailable,
    /// macOS found no running process for the selected browser, so it has nothing to ask about
    /// yet. This is not a denial and must not be surfaced as one.
    #[cfg(target_os = "macos")]
    BrowserNotRunning,
    Granted,
    Denied,
    Unavailable,
}

impl ClassroomBrowserPermission {
    /// True when the operating system permits Millennium to read the selected browser.
    pub fn allows_reading(&self) -> bool {
        match self {
            Self::Granted => true,
            #[cfg(not(target_os = "macos"))]
            Self::NotRequired => true,
            _ => false,
        }
    }
}

/// Everything the Classroom permission dialog needs to explain why macOS has not granted
/// automation access, and which recovery step actually applies.
///
/// Ad-hoc signed builds cannot be notarised, so a downloaded copy keeps `com.apple.quarantine`.
/// Gatekeeper then runs it from a randomised read-only App Translocation path, and macOS refuses
/// to bind a durable Automation grant to that path — the prompt never appears and no entry is ever
/// written to Privacy & Security > Automation, which has no way to add one by hand.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomAutomationDiagnostics {
    /// False on platforms that do not gate browser reading behind a privacy setting.
    pub required: bool,
    pub permission: ClassroomBrowserPermission,
    /// Raw macOS `OSStatus` from the last permission determination, for support reports.
    pub status_code: i32,
    pub bundle_identifier: String,
    pub bundle_path: Option<String>,
    pub browser_name: String,
    pub is_packaged: bool,
    pub is_quarantined: bool,
    pub is_translocated: bool,
    pub is_in_applications: bool,
    pub signature_valid: bool,
    pub has_usage_description: bool,
    pub browser_running: bool,
    /// True when at least one blocker can be cleared from inside the app.
    pub can_repair: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomAutomationRepair {
    pub quarantine_cleared: bool,
    pub permission_reset: bool,
    /// Human-readable record of what the repair did or could not do.
    pub notes: Vec<String>,
    pub diagnostics: ClassroomAutomationDiagnostics,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartClassroomSyncInput {
    pub browser_id: String,
    pub keep_signed_in: bool,
    pub owner_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ClassroomSyncPhase {
    Idle,
    Launching,
    AwaitingLogin,
    Scraping,
    SavingLocally,
    Completed,
    Partial,
    Cancelled,
    Error,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ClassroomLocalSnapshotState {
    Unknown,
    Missing,
    Existing,
    Saving,
    Saved,
    Preserved,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ClassroomCloudSyncState {
    Deferred,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomSyncStatus {
    pub phase: ClassroomSyncPhase,
    pub operation_id: Option<String>,
    pub browser: Option<ClassroomBrowser>,
    pub keep_signed_in: bool,
    pub courses_found: u32,
    pub items_found: u32,
    pub local_snapshot_available: Option<bool>,
    pub local_snapshot_state: ClassroomLocalSnapshotState,
    pub cloud_sync_state: ClassroomCloudSyncState,
    pub error_code: Option<String>,
    pub message: Option<String>,
}

impl Default for ClassroomSyncStatus {
    fn default() -> Self {
        Self {
            phase: ClassroomSyncPhase::Idle,
            operation_id: None,
            browser: None,
            keep_signed_in: false,
            courses_found: 0,
            items_found: 0,
            local_snapshot_available: None,
            local_snapshot_state: ClassroomLocalSnapshotState::Unknown,
            cloud_sync_state: ClassroomCloudSyncState::Deferred,
            error_code: None,
            message: None,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomCommandError {
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
}

impl ClassroomCommandError {
    pub fn new(code: &'static str, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedCourse {
    pub title: String,
    pub url: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedAttachment {
    pub name: String,
    pub url: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedSubmission {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grade: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_points: Option<f64>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedItem {
    pub title: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub posted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub submission: Option<ExtractedSubmission>,
    pub attachments: Vec<ExtractedAttachment>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedPage {
    pub courses: Vec<ExtractedCourse>,
    pub items: Vec<ExtractedItem>,
    pub empty_state_observed: bool,
    pub reached_page_end: bool,
    pub page_content_observed: bool,
    pub course_limit_reached: bool,
    pub item_limit_reached: bool,
    pub attachment_limit_reached: bool,
    pub account_hint: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomCourse {
    pub id: String,
    pub title: String,
    pub url: String,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ClassroomItemKind {
    Assignment,
    Material,
    Question,
    Announcement,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ClassroomAttachmentKind {
    Document,
    Spreadsheet,
    Presentation,
    DriveFile,
    Link,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ClassroomSubmissionStatus {
    Assigned,
    TurnedIn,
    Returned,
    Missing,
    Graded,
    Unknown,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomSubmission {
    pub status: ClassroomSubmissionStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grade: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_points: Option<f64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomAttachment {
    pub id: String,
    pub name: String,
    pub url: String,
    pub kind: ClassroomAttachmentKind,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomItem {
    pub id: String,
    pub course_id: String,
    pub kind: ClassroomItemKind,
    pub title: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub posted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub submission: Option<ClassroomSubmission>,
    pub attachments: Vec<ClassroomAttachment>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomCoverage {
    pub course_list_visited: bool,
    pub course_list_complete: bool,
    pub empty_state_observed: bool,
    pub courses_observed: usize,
    pub course_pages_visited: usize,
    pub course_pages_failed: usize,
    pub issues: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomCounts {
    pub courses: usize,
    pub items: usize,
    pub attachments: usize,
    pub assigned: usize,
    pub turned_in: usize,
    pub returned: usize,
    pub missing: usize,
    pub graded: usize,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ClassroomSnapshotIntegrity {
    Complete,
    Partial,
    VerifiedEmpty,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassroomSyncMetadata {
    pub source: &'static str,
    pub extractor_version: &'static str,
    pub synced_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_hint: Option<String>,
    pub integrity: ClassroomSnapshotIntegrity,
    pub counts: ClassroomCounts,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopClassroomSnapshot {
    pub owner_id: String,
    pub version: u8,
    pub courses: Vec<ClassroomCourse>,
    pub items: Vec<ClassroomItem>,
    pub coverage: ClassroomCoverage,
    pub sync: ClassroomSyncMetadata,
}
