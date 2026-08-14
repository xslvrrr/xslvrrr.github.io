use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const STUDY_LOCAL_SCHEMA_VERSION: u32 = 1;

/// Entity kinds the local store mirrors. Sessions and analytics stay server-side for now.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum StudyEntityKind {
    Deck,
    Note,
    Card,
    Preference,
}

impl StudyEntityKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Deck => "deck",
            Self::Note => "note",
            Self::Card => "card",
            Self::Preference => "preference",
        }
    }

}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum StudyOutboxKind {
    Review,
    Undo,
}

impl StudyOutboxKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Review => "review",
            Self::Undo => "undo",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "review" => Some(Self::Review),
            "undo" => Some(Self::Undo),
            _ => None,
        }
    }
}

/// How the server answered one pushed operation.
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StudyOutboxOutcome {
    /// Server committed the operation, or already had it. Safe to drop locally.
    Accepted,
    Duplicate,
    /// Terminal failures. The operation is preserved for the user to resolve, never replayed.
    Conflict,
    Rejected,
    /// Transient failure. The operation stays pending.
    Retry,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyLocalEntity {
    pub kind: StudyEntityKind,
    pub id: String,
    #[serde(default)]
    pub revision: i64,
    pub payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyLocalChange {
    pub kind: StudyEntityKind,
    pub id: String,
    #[serde(default)]
    pub revision: i64,
    /// `None` is a tombstone: the entity is removed from the local store.
    #[serde(default)]
    pub payload: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyLocalSnapshot {
    pub cursor: i64,
    pub entities: Vec<StudyLocalEntity>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyLocalChangeBatch {
    pub cursor: i64,
    pub changes: Vec<StudyLocalChange>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyLocalReviewCommand {
    pub operation_id: String,
    pub kind: StudyOutboxKind,
    pub card_id: String,
    /// The exact request body the client will push, so a restart replays it byte for byte.
    pub command: Value,
    /// Optimistic local projection applied in the same transaction as the outbox insert.
    pub card: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyLocalResolution {
    pub operation_id: String,
    pub outcome: StudyOutboxOutcome,
    #[serde(default)]
    pub error_code: Option<String>,
    /// Authoritative card returned by the server; replaces the optimistic projection.
    #[serde(default)]
    pub card: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyLocalOutboxEntry {
    pub operation_id: String,
    pub kind: String,
    pub card_id: String,
    pub status: String,
    pub attempt_count: i64,
    pub last_error_code: Option<String>,
    pub command: Value,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyLocalStatus {
    pub cursor: i64,
    pub device_id: String,
    pub pending_count: i64,
    pub conflict_count: i64,
    pub deck_count: i64,
    pub note_count: i64,
    pub card_count: i64,
    pub oldest_pending_at: Option<String>,
    pub last_pulled_at: Option<String>,
    pub last_pushed_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyLocalLibrary {
    pub cursor: i64,
    pub device_id: String,
    pub decks: Vec<Value>,
    pub notes: Vec<Value>,
    pub cards: Vec<Value>,
    pub preferences: Option<Value>,
}
