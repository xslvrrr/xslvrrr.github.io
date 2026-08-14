use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const CACHE_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopIdentity {
    pub owner_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub portal_uid: Option<String>,
    pub display_name: String,
    pub school: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    pub last_authenticated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_bootstrap_at: Option<String>,
    pub schema_version: u32,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SecureRecordKind {
    PortalData,
    ClassroomData,
    Bootstrap,
}

impl SecureRecordKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PortalData => "portal-data",
            Self::ClassroomData => "classroom-data",
            Self::Bootstrap => "bootstrap",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "action", content = "payload", rename_all = "kebab-case")]
pub enum DesktopRecordReconciliation {
    Preserve,
    Replace(Value),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopBootstrapRequest {
    pub identity: DesktopIdentity,
    pub portal_data: DesktopRecordReconciliation,
    pub classroom_data: DesktopRecordReconciliation,
    pub bootstrap: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecureCacheCommandError {
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
}

impl SecureCacheCommandError {
    pub fn unavailable(message: impl Into<String>) -> Self {
        Self {
            code: "SECURE_CACHE_UNAVAILABLE",
            message: message.into(),
            retryable: true,
        }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self {
            code: "INVALID_CACHE_INPUT",
            message: message.into(),
            retryable: false,
        }
    }

    pub fn owner_mismatch() -> Self {
        Self {
            code: "OWNER_MISMATCH",
            message: "The requested local data does not belong to the active desktop account."
                .to_owned(),
            retryable: false,
        }
    }

    pub fn owner_switch_required() -> Self {
        Self {
            code: "OWNER_SWITCH_REQUIRED",
            message:
                "Clear the current desktop account before signing in with a different account."
                    .to_owned(),
            retryable: false,
        }
    }

    pub fn classroom_sync_active() -> Self {
        Self {
            code: "CLASSROOM_SYNC_ACTIVE",
            message: "Finish or cancel the active Classroom operation before deleting local data."
                .to_owned(),
            retryable: true,
        }
    }
}
