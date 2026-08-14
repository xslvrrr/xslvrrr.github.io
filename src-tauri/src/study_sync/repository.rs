use std::path::PathBuf;

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::Value;
use tauri::AppHandle;

use crate::secure_cache::{crypto::CacheCrypto, database_path, open_connection};

use super::models::{
    StudyEntityKind, StudyLocalChangeBatch, StudyLocalLibrary, StudyLocalOutboxEntry,
    StudyLocalResolution, StudyLocalReviewCommand, StudyLocalSnapshot, StudyLocalStatus,
    StudyOutboxKind, StudyOutboxOutcome, STUDY_LOCAL_SCHEMA_VERSION,
};

const OUTBOX_RECORD_KIND: &str = "study-outbox";
const MAX_ENTITY_BYTES: usize = 64 * 1024;
const MAX_COMMAND_BYTES: usize = 16 * 1024;
const MAX_BATCH_ENTITIES: usize = 5_000;
/// Bounded so a long offline stretch cannot grow the local database without limit.
const MAX_OUTBOX_ROWS: i64 = 10_000;

pub struct StudySyncRepository {
    database_path: PathBuf,
    crypto: CacheCrypto,
}

impl StudySyncRepository {
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let database_path = database_path(app)?;
        let connection = open_connection(&database_path)?;
        connection
            .execute_batch(include_str!("../../migrations/005_study_offline.sql"))
            .map_err(|error| format!("failed to initialize the local Study store: {error}"))?;
        let has_existing_ciphertext = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM study_entities LIMIT 1)",
                [],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|error| format!("failed to inspect the local Study store: {error}"))?;
        let crypto = CacheCrypto::load_or_create(has_existing_ciphertext)?;
        Ok(Self {
            database_path,
            crypto,
        })
    }

    fn connection(&self) -> Result<Connection, String> {
        open_connection(&self.database_path)
    }

    fn scope(&self, owner_id: &str) -> Result<String, String> {
        self.crypto.owner_scope(owner_id)
    }

    pub fn status(&self, owner_id: &str) -> Result<StudyLocalStatus, String> {
        let scope = self.scope(owner_id)?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to read local Study status: {error}"))?;
        let (cursor, device_id, last_pulled_at, last_pushed_at) =
            read_or_create_meta(&transaction, &scope)?;
        let status = StudyLocalStatus {
            cursor,
            device_id,
            pending_count: count_outbox(&transaction, &scope, "pending")?,
            conflict_count: count_outbox(&transaction, &scope, "conflict")?,
            deck_count: count_entities(&transaction, &scope, StudyEntityKind::Deck)?,
            note_count: count_entities(&transaction, &scope, StudyEntityKind::Note)?,
            card_count: count_entities(&transaction, &scope, StudyEntityKind::Card)?,
            oldest_pending_at: transaction
                .query_row(
                    "SELECT created_at FROM study_outbox WHERE owner_scope = ?1 AND status = 'pending'
                     ORDER BY sequence LIMIT 1",
                    params![scope],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|error| format!("failed to read the local Study outbox: {error}"))?,
            last_pulled_at,
            last_pushed_at,
        };
        transaction
            .commit()
            .map_err(|error| format!("failed to finish reading local Study status: {error}"))?;
        Ok(status)
    }

    pub fn library(&self, owner_id: &str) -> Result<StudyLocalLibrary, String> {
        let scope = self.scope(owner_id)?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to read the local Study library: {error}"))?;
        let (cursor, device_id, _, _) = read_or_create_meta(&transaction, &scope)?;
        let library = StudyLocalLibrary {
            cursor,
            device_id,
            decks: self.read_entities(&transaction, &scope, StudyEntityKind::Deck)?,
            notes: self.read_entities(&transaction, &scope, StudyEntityKind::Note)?,
            cards: self.read_entities(&transaction, &scope, StudyEntityKind::Card)?,
            preferences: self
                .read_entities(&transaction, &scope, StudyEntityKind::Preference)?
                .into_iter()
                .next(),
        };
        transaction
            .commit()
            .map_err(|error| format!("failed to finish reading the local Study library: {error}"))?;
        Ok(library)
    }

    /// Replaces every local entity for this owner. Used when the server cursor is unusable and a
    /// full snapshot is the only complete answer. The outbox is deliberately preserved.
    pub fn apply_snapshot(
        &self,
        owner_id: &str,
        snapshot: &StudyLocalSnapshot,
    ) -> Result<(), String> {
        if snapshot.entities.len() > MAX_BATCH_ENTITIES {
            return Err("The Study snapshot is too large for local storage.".to_owned());
        }
        let scope = self.scope(owner_id)?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin the local Study snapshot: {error}"))?;
        transaction
            .execute(
                "DELETE FROM study_entities WHERE owner_scope = ?1",
                params![scope],
            )
            .map_err(|error| format!("failed to reset the local Study library: {error}"))?;
        for entity in &snapshot.entities {
            self.write_entity(&transaction, &scope, entity.kind, &entity.id, entity.revision, &entity.payload)?;
        }
        set_cursor(&transaction, &scope, snapshot.cursor, true)?;
        transaction
            .commit()
            .map_err(|error| format!("failed to store the local Study snapshot: {error}"))
    }

    /// Applies one pulled page. Entities and the cursor move together, so an interrupted sync
    /// never advances past data it did not store.
    pub fn apply_changes(&self, owner_id: &str, batch: &StudyLocalChangeBatch) -> Result<(), String> {
        if batch.changes.len() > MAX_BATCH_ENTITIES {
            return Err("The Study change batch is too large for local storage.".to_owned());
        }
        let scope = self.scope(owner_id)?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin the local Study update: {error}"))?;
        for change in &batch.changes {
            match &change.payload {
                Some(payload) => self.write_entity(
                    &transaction,
                    &scope,
                    change.kind,
                    &change.id,
                    change.revision,
                    payload,
                )?,
                None => {
                    transaction
                        .execute(
                            "DELETE FROM study_entities
                             WHERE owner_scope = ?1 AND entity_kind = ?2 AND entity_id = ?3",
                            params![scope, change.kind.as_str(), change.id],
                        )
                        .map_err(|error| {
                            format!("failed to remove local Study content: {error}")
                        })?;
                }
            }
        }
        set_cursor(&transaction, &scope, batch.cursor, true)?;
        transaction
            .commit()
            .map_err(|error| format!("failed to store the local Study update: {error}"))
    }

    /// Records an offline review: the optimistic card projection and the durable outbox command
    /// commit in the same SQLite transaction, so neither can survive without the other.
    pub fn record_review(
        &self,
        owner_id: &str,
        command: &StudyLocalReviewCommand,
    ) -> Result<(), String> {
        let scope = self.scope(owner_id)?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin the offline review: {error}"))?;

        let outbox_rows: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM study_outbox WHERE owner_scope = ?1",
                params![scope],
                |row| row.get(0),
            )
            .map_err(|error| format!("failed to inspect the local Study outbox: {error}"))?;
        if outbox_rows >= MAX_OUTBOX_ROWS {
            return Err(
                "Too many Study reviews are waiting to sync. Reconnect before reviewing more."
                    .to_owned(),
            );
        }

        let plaintext = serde_json::to_vec(&command.command)
            .map_err(|error| format!("failed to serialize the offline review: {error}"))?;
        if plaintext.len() > MAX_COMMAND_BYTES {
            return Err("The offline review is too large to store locally.".to_owned());
        }
        let (nonce, ciphertext) = self.crypto.encrypt(
            &scope,
            OUTBOX_RECORD_KIND,
            STUDY_LOCAL_SCHEMA_VERSION,
            &plaintext,
        )?;
        let timestamp = Utc::now().to_rfc3339();
        // A replayed operation ID is the same review, so keep the first durable record.
        transaction
            .execute(
                "INSERT INTO study_outbox
                   (owner_scope, operation_id, operation_kind, card_id, status, attempt_count,
                    schema_version, nonce, ciphertext, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 'pending', 0, ?5, ?6, ?7, ?8, ?8)
                 ON CONFLICT(owner_scope, operation_id) DO NOTHING",
                params![
                    scope,
                    command.operation_id,
                    command.kind.as_str(),
                    command.card_id,
                    STUDY_LOCAL_SCHEMA_VERSION,
                    nonce.as_slice(),
                    ciphertext,
                    timestamp,
                ],
            )
            .map_err(|error| format!("failed to queue the offline review: {error}"))?;

        let revision = command
            .card
            .get("scheduleRevision")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        self.write_entity(
            &transaction,
            &scope,
            StudyEntityKind::Card,
            &command.card_id,
            revision,
            &command.card,
        )?;

        transaction
            .commit()
            .map_err(|error| format!("failed to save the offline review: {error}"))
    }

    pub fn pending(&self, owner_id: &str, limit: usize) -> Result<Vec<StudyLocalOutboxEntry>, String> {
        self.read_outbox(owner_id, "pending", limit)
    }

    pub fn conflicts(&self, owner_id: &str, limit: usize) -> Result<Vec<StudyLocalOutboxEntry>, String> {
        self.read_outbox(owner_id, "conflict", limit)
    }

    /// Consumes push results. Only operations the server confirmed are removed; conflicts and
    /// rejections are preserved for the user, and transient failures stay pending.
    pub fn resolve(
        &self,
        owner_id: &str,
        resolutions: &[StudyLocalResolution],
    ) -> Result<(), String> {
        let scope = self.scope(owner_id)?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin the Study sync update: {error}"))?;
        let timestamp = Utc::now().to_rfc3339();

        for resolution in resolutions {
            match resolution.outcome {
                StudyOutboxOutcome::Accepted | StudyOutboxOutcome::Duplicate => {
                    transaction
                        .execute(
                            "DELETE FROM study_outbox WHERE owner_scope = ?1 AND operation_id = ?2",
                            params![scope, resolution.operation_id],
                        )
                        .map_err(|error| format!("failed to clear a synced review: {error}"))?;
                }
                StudyOutboxOutcome::Conflict | StudyOutboxOutcome::Rejected => {
                    transaction
                        .execute(
                            "UPDATE study_outbox
                             SET status = 'conflict', last_error_code = ?3, updated_at = ?4
                             WHERE owner_scope = ?1 AND operation_id = ?2",
                            params![
                                scope,
                                resolution.operation_id,
                                resolution.error_code,
                                timestamp
                            ],
                        )
                        .map_err(|error| format!("failed to record a sync conflict: {error}"))?;
                }
                StudyOutboxOutcome::Retry => {
                    transaction
                        .execute(
                            "UPDATE study_outbox
                             SET attempt_count = attempt_count + 1, last_error_code = ?3, updated_at = ?4
                             WHERE owner_scope = ?1 AND operation_id = ?2",
                            params![
                                scope,
                                resolution.operation_id,
                                resolution.error_code,
                                timestamp
                            ],
                        )
                        .map_err(|error| format!("failed to record a sync retry: {error}"))?;
                }
            }

            // The server's card is authoritative for every outcome that carries one.
            if let Some(card) = &resolution.card {
                if let Some(card_id) = card.get("id").and_then(Value::as_str) {
                    let revision = card
                        .get("scheduleRevision")
                        .and_then(Value::as_i64)
                        .unwrap_or(0);
                    self.write_entity(
                        &transaction,
                        &scope,
                        StudyEntityKind::Card,
                        card_id,
                        revision,
                        card,
                    )?;
                }
            }
        }

        read_or_create_meta(&transaction, &scope)?;
        transaction
            .execute(
                "UPDATE study_sync_meta SET last_pushed_at = ?2, updated_at = ?2 WHERE owner_scope = ?1",
                params![scope, timestamp],
            )
            .map_err(|error| format!("failed to record the Study sync time: {error}"))?;

        transaction
            .commit()
            .map_err(|error| format!("failed to store the Study sync update: {error}"))
    }

    pub fn discard_conflict(&self, owner_id: &str, operation_id: &str) -> Result<(), String> {
        let scope = self.scope(owner_id)?;
        let connection = self.connection()?;
        connection
            .execute(
                "DELETE FROM study_outbox
                 WHERE owner_scope = ?1 AND operation_id = ?2 AND status = 'conflict'",
                params![scope, operation_id],
            )
            .map_err(|error| format!("failed to discard the Study conflict: {error}"))?;
        Ok(())
    }

    /// Removes local Study data for one owner, including anything still queued. Used on sign-out
    /// and account switches, never as part of routine sync.
    pub fn clear(&self, owner_id: &str) -> Result<(), String> {
        let scope = self.scope(owner_id)?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin clearing local Study data: {error}"))?;
        for statement in [
            "DELETE FROM study_entities WHERE owner_scope = ?1",
            "DELETE FROM study_outbox WHERE owner_scope = ?1",
            "DELETE FROM study_sync_meta WHERE owner_scope = ?1",
        ] {
            transaction
                .execute(statement, params![scope])
                .map_err(|error| format!("failed to clear local Study data: {error}"))?;
        }
        transaction
            .commit()
            .map_err(|error| format!("failed to finish clearing local Study data: {error}"))
    }

    fn write_entity(
        &self,
        transaction: &Transaction<'_>,
        scope: &str,
        kind: StudyEntityKind,
        id: &str,
        revision: i64,
        payload: &Value,
    ) -> Result<(), String> {
        let plaintext = serde_json::to_vec(payload)
            .map_err(|error| format!("failed to serialize local Study content: {error}"))?;
        if plaintext.len() > MAX_ENTITY_BYTES {
            return Err("A Study item is too large to store locally.".to_owned());
        }
        let record_kind = entity_record_kind(kind);
        let (nonce, ciphertext) =
            self.crypto
                .encrypt(scope, &record_kind, STUDY_LOCAL_SCHEMA_VERSION, &plaintext)?;
        transaction
            .execute(
                "INSERT INTO study_entities
                   (owner_scope, entity_kind, entity_id, revision, schema_version, nonce, ciphertext, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(owner_scope, entity_kind, entity_id) DO UPDATE SET
                   revision = excluded.revision,
                   schema_version = excluded.schema_version,
                   nonce = excluded.nonce,
                   ciphertext = excluded.ciphertext,
                   updated_at = excluded.updated_at",
                params![
                    scope,
                    kind.as_str(),
                    id,
                    revision,
                    STUDY_LOCAL_SCHEMA_VERSION,
                    nonce.as_slice(),
                    ciphertext,
                    Utc::now().to_rfc3339(),
                ],
            )
            .map_err(|error| format!("failed to store local Study content: {error}"))?;
        Ok(())
    }

    fn read_entities(
        &self,
        transaction: &Transaction<'_>,
        scope: &str,
        kind: StudyEntityKind,
    ) -> Result<Vec<Value>, String> {
        let mut statement = transaction
            .prepare(
                "SELECT entity_id, schema_version, nonce, ciphertext
                 FROM study_entities
                 WHERE owner_scope = ?1 AND entity_kind = ?2
                 ORDER BY entity_id",
            )
            .map_err(|error| format!("failed to read local Study content: {error}"))?;
        let rows = statement
            .query_map(params![scope, kind.as_str()], |row| {
                Ok((
                    row.get::<_, u32>(1)?,
                    row.get::<_, Vec<u8>>(2)?,
                    row.get::<_, Vec<u8>>(3)?,
                ))
            })
            .map_err(|error| format!("failed to read local Study content: {error}"))?;

        let record_kind = entity_record_kind(kind);
        let mut entities = Vec::new();
        for row in rows {
            let (schema_version, nonce, ciphertext) =
                row.map_err(|error| format!("failed to read local Study content: {error}"))?;
            let plaintext =
                self.crypto
                    .decrypt(scope, &record_kind, schema_version, &nonce, &ciphertext)?;
            entities.push(
                serde_json::from_slice(&plaintext)
                    .map_err(|error| format!("failed to parse local Study content: {error}"))?,
            );
        }
        Ok(entities)
    }

    fn read_outbox(
        &self,
        owner_id: &str,
        status: &str,
        limit: usize,
    ) -> Result<Vec<StudyLocalOutboxEntry>, String> {
        let scope = self.scope(owner_id)?;
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT operation_id, operation_kind, card_id, status, attempt_count, last_error_code,
                        schema_version, nonce, ciphertext, created_at
                 FROM study_outbox
                 WHERE owner_scope = ?1 AND status = ?2
                 ORDER BY sequence
                 LIMIT ?3",
            )
            .map_err(|error| format!("failed to read the local Study outbox: {error}"))?;
        let rows = statement
            .query_map(params![scope, status, limit as i64], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, u32>(6)?,
                    row.get::<_, Vec<u8>>(7)?,
                    row.get::<_, Vec<u8>>(8)?,
                    row.get::<_, String>(9)?,
                ))
            })
            .map_err(|error| format!("failed to read the local Study outbox: {error}"))?;

        let mut entries = Vec::new();
        for row in rows {
            let row = row.map_err(|error| format!("failed to read the local Study outbox: {error}"))?;
            let plaintext = self.crypto.decrypt(
                &scope,
                OUTBOX_RECORD_KIND,
                row.6,
                &row.7,
                &row.8,
            )?;
            entries.push(StudyLocalOutboxEntry {
                operation_id: row.0,
                kind: StudyOutboxKind::from_str(&row.1)
                    .ok_or_else(|| "the local Study outbox holds an unknown operation".to_owned())?
                    .as_str()
                    .to_owned(),
                card_id: row.2,
                status: row.3,
                attempt_count: row.4,
                last_error_code: row.5,
                command: serde_json::from_slice(&plaintext).map_err(|error| {
                    format!("failed to parse a queued Study review: {error}")
                })?,
                created_at: row.9,
            });
        }
        Ok(entries)
    }
}

fn entity_record_kind(kind: StudyEntityKind) -> String {
    format!("study-{}", kind.as_str())
}

fn count_entities(
    transaction: &Transaction<'_>,
    scope: &str,
    kind: StudyEntityKind,
) -> Result<i64, String> {
    transaction
        .query_row(
            "SELECT COUNT(*) FROM study_entities WHERE owner_scope = ?1 AND entity_kind = ?2",
            params![scope, kind.as_str()],
            |row| row.get(0),
        )
        .map_err(|error| format!("failed to count local Study content: {error}"))
}

fn count_outbox(transaction: &Transaction<'_>, scope: &str, status: &str) -> Result<i64, String> {
    transaction
        .query_row(
            "SELECT COUNT(*) FROM study_outbox WHERE owner_scope = ?1 AND status = ?2",
            params![scope, status],
            |row| row.get(0),
        )
        .map_err(|error| format!("failed to count queued Study reviews: {error}"))
}

fn read_or_create_meta(
    transaction: &Transaction<'_>,
    scope: &str,
) -> Result<(i64, String, Option<String>, Option<String>), String> {
    let existing = transaction
        .query_row(
            "SELECT cursor, device_id, last_pulled_at, last_pushed_at FROM study_sync_meta WHERE owner_scope = ?1",
            params![scope],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|error| format!("failed to read the local Study sync state: {error}"))?;
    if let Some(meta) = existing {
        return Ok(meta);
    }

    // Installation-scoped random identifier. Never derived from hardware or account details.
    let device_id = new_device_id()?;
    let timestamp = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO study_sync_meta (owner_scope, cursor, device_id, updated_at)
             VALUES (?1, 0, ?2, ?3)",
            params![scope, device_id, timestamp],
        )
        .map_err(|error| format!("failed to create the local Study sync state: {error}"))?;
    Ok((0, device_id, None, None))
}

fn set_cursor(
    transaction: &Transaction<'_>,
    scope: &str,
    cursor: i64,
    pulled: bool,
) -> Result<(), String> {
    if cursor < 0 {
        return Err("The Study sync cursor is invalid.".to_owned());
    }
    let (_, device_id, _, _) = read_or_create_meta(transaction, scope)?;
    let timestamp = Utc::now().to_rfc3339();
    transaction
        .execute(
            "UPDATE study_sync_meta
             SET cursor = ?2,
                 device_id = ?3,
                 last_pulled_at = CASE WHEN ?4 THEN ?5 ELSE last_pulled_at END,
                 updated_at = ?5
             WHERE owner_scope = ?1",
            params![scope, cursor, device_id, pulled, timestamp],
        )
        .map_err(|error| format!("failed to advance the Study sync cursor: {error}"))?;
    Ok(())
}

fn new_device_id() -> Result<String, String> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)
        .map_err(|error| format!("failed to generate a device identifier: {error}"))?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    ))
}
