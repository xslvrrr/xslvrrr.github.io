use std::{fs, path::PathBuf, sync::RwLock};

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::{
    crypto::CacheCrypto,
    models::{
        DesktopBootstrapRequest, DesktopIdentity, DesktopRecordReconciliation, SecureRecordKind,
        CACHE_SCHEMA_VERSION,
    },
};

const IDENTITY_RECORD_KIND: &str = "active-identity";
const LEGACY_MIGRATION_PREFIX: &str = "legacy-migration-v1";

pub struct SecureCacheRepository {
    database_path: PathBuf,
    crypto: RwLock<CacheCrypto>,
}

impl SecureCacheRepository {
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let database_path = database_path(app)?;
        let connection = open_connection(&database_path)?;
        connection
            .execute_batch(include_str!("../../migrations/004_encrypted_cache.sql"))
            .map_err(|error| format!("failed to initialize encrypted cache: {error}"))?;
        let has_existing_ciphertext = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM secure_records LIMIT 1)",
                [],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|error| format!("failed to inspect encrypted cache: {error}"))?;
        let crypto = CacheCrypto::load_or_create(has_existing_ciphertext)?;
        connection
            .execute(
                "INSERT OR IGNORE INTO secure_meta (key, value) VALUES ('key_version', '1')",
                [],
            )
            .map_err(|error| format!("failed to record cache key version: {error}"))?;
        Ok(Self {
            database_path,
            crypto: RwLock::new(crypto),
        })
    }

    pub fn reset_irrecoverable(app: &AppHandle) -> Result<Self, String> {
        let database_path = database_path(app)?;
        let mut connection = open_connection(&database_path)?;
        connection
            .execute_batch(include_str!("../../migrations/004_encrypted_cache.sql"))
            .map_err(|error| format!("failed to initialize encrypted cache reset: {error}"))?;
        connection
            .pragma_update(None, "secure_delete", "ON")
            .map_err(|error| format!("failed to enable secure cache reset: {error}"))?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin irrecoverable cache reset: {error}"))?;
        transaction
            .execute("DELETE FROM secure_records", [])
            .map_err(|error| {
                format!("failed to remove irrecoverable encrypted records: {error}")
            })?;
        transaction
            .execute("DELETE FROM secure_meta", [])
            .map_err(|error| format!("failed to reset encrypted cache metadata: {error}"))?;
        delete_all_legacy_rows(&transaction)?;
        transaction
            .commit()
            .map_err(|error| format!("failed to commit irrecoverable cache reset: {error}"))?;

        let crypto = CacheCrypto::rotate()?;
        connection
            .execute(
                "INSERT INTO secure_meta (key, value) VALUES ('key_version', '1')",
                [],
            )
            .map_err(|error| format!("failed to record replacement cache key version: {error}"))?;
        connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
            .map_err(|error| format!("failed to finalize irrecoverable cache reset: {error}"))?;
        Ok(Self {
            database_path,
            crypto: RwLock::new(crypto),
        })
    }

    pub fn read_identity(&mut self) -> Result<Option<DesktopIdentity>, String> {
        let crypto = self
            .crypto
            .read()
            .map_err(|_| "cache encryption state is unavailable".to_owned())?;
        let device_scope = crypto.device_scope()?;
        let connection = self.connection()?;
        read_typed_record(&connection, &crypto, &device_scope, IDENTITY_RECORD_KIND)
    }

    pub fn write_identity(&mut self, identity: &DesktopIdentity) -> Result<(), String> {
        if self
            .read_identity()?
            .is_some_and(|current| current.owner_id != identity.owner_id)
        {
            return Err("OWNER_SWITCH_REQUIRED".to_owned());
        }
        let crypto = self
            .crypto
            .read()
            .map_err(|_| "cache encryption state is unavailable".to_owned())?;
        let device_scope = crypto.device_scope()?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin identity transaction: {error}"))?;
        write_typed_record(
            &transaction,
            &crypto,
            &device_scope,
            IDENTITY_RECORD_KIND,
            CACHE_SCHEMA_VERSION,
            identity,
        )?;
        transaction
            .commit()
            .map_err(|error| format!("failed to commit desktop identity: {error}"))?;
        drop(crypto);
        self.migrate_legacy_records(identity)
    }

    pub fn verify_owner(&mut self, owner_id: &str) -> Result<(), String> {
        self.authorize_owner(owner_id).map(|_| ())
    }

    pub fn read_record(
        &mut self,
        owner_id: &str,
        kind: SecureRecordKind,
    ) -> Result<Option<Value>, String> {
        self.authorize_owner(owner_id)?;
        let crypto = self
            .crypto
            .read()
            .map_err(|_| "cache encryption state is unavailable".to_owned())?;
        let owner_scope = crypto.owner_scope(owner_id)?;
        let connection = self.connection()?;
        read_json_record(&connection, &crypto, &owner_scope, kind.as_str())
    }

    /// Answers whether a record exists without decrypting it. Boot only needs to know which
    /// caches are populated, and decrypting a whole portal snapshot to discard it was the most
    /// expensive thing the desktop did before its first frame.
    pub fn has_record(&mut self, owner_id: &str, kind: SecureRecordKind) -> Result<bool, String> {
        self.authorize_owner(owner_id)?;
        let crypto = self
            .crypto
            .read()
            .map_err(|_| "cache encryption state is unavailable".to_owned())?;
        let owner_scope = crypto.owner_scope(owner_id)?;
        let connection = self.connection()?;
        connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM secure_records WHERE owner_scope = ?1 AND record_kind = ?2)",
                params![owner_scope, kind.as_str()],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|error| format!("failed to inspect local cache: {error}"))
    }

    pub fn write_record(
        &mut self,
        owner_id: &str,
        kind: SecureRecordKind,
        payload: &Value,
    ) -> Result<bool, String> {
        let identity = self.authorize_owner(owner_id)?;
        validate_record_owner(&identity, kind, payload)?;
        let crypto = self
            .crypto
            .read()
            .map_err(|_| "cache encryption state is unavailable".to_owned())?;
        let owner_scope = crypto.owner_scope(owner_id)?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin cache transaction: {error}"))?;
        let should_write = match kind {
            SecureRecordKind::PortalData | SecureRecordKind::ClassroomData => {
                can_replace_bootstrap_record(&transaction, &crypto, &owner_scope, kind, payload)?
            }
            SecureRecordKind::Bootstrap => true,
        };
        if should_write {
            write_typed_record(
                &transaction,
                &crypto,
                &owner_scope,
                kind.as_str(),
                CACHE_SCHEMA_VERSION,
                payload,
            )?;
        }
        transaction
            .commit()
            .map_err(|error| format!("failed to commit local cache: {error}"))?;
        Ok(should_write)
    }

    pub fn overwrite_record(
        &mut self,
        owner_id: &str,
        kind: SecureRecordKind,
        payload: &Value,
    ) -> Result<(), String> {
        let identity = self.authorize_owner(owner_id)?;
        validate_record_owner(&identity, kind, payload)?;
        let crypto = self
            .crypto
            .read()
            .map_err(|_| "cache encryption state is unavailable".to_owned())?;
        let owner_scope = crypto.owner_scope(owner_id)?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin cache replacement: {error}"))?;
        write_typed_record(
            &transaction,
            &crypto,
            &owner_scope,
            kind.as_str(),
            CACHE_SCHEMA_VERSION,
            payload,
        )?;
        transaction
            .commit()
            .map_err(|error| format!("failed to commit local cache replacement: {error}"))
    }

    pub fn write_bootstrap(&mut self, request: &DesktopBootstrapRequest) -> Result<(), String> {
        self.write_identity(&request.identity)?;
        let crypto = self
            .crypto
            .read()
            .map_err(|_| "cache encryption state is unavailable".to_owned())?;
        let device_scope = crypto.device_scope()?;
        let owner_scope = crypto.owner_scope(&request.identity.owner_id)?;
        let mut connection = self.connection()?;
        connection
            .pragma_update(None, "secure_delete", "ON")
            .map_err(|error| format!("failed to enable secure legacy cleanup: {error}"))?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin bootstrap transaction: {error}"))?;

        write_typed_record(
            &transaction,
            &crypto,
            &device_scope,
            IDENTITY_RECORD_KIND,
            CACHE_SCHEMA_VERSION,
            &request.identity,
        )?;
        reconcile_bootstrap_record(
            &transaction,
            &crypto,
            &owner_scope,
            SecureRecordKind::PortalData,
            &request.portal_data,
        )?;
        reconcile_bootstrap_record(
            &transaction,
            &crypto,
            &owner_scope,
            SecureRecordKind::ClassroomData,
            &request.classroom_data,
        )?;
        write_typed_record(
            &transaction,
            &crypto,
            &owner_scope,
            SecureRecordKind::Bootstrap.as_str(),
            CACHE_SCHEMA_VERSION,
            &request.bootstrap,
        )?;
        let removed_plaintext = delete_ownerless_legacy_rows(&transaction)?;
        transaction
            .commit()
            .map_err(|error| format!("failed to commit desktop bootstrap: {error}"))?;
        if removed_plaintext {
            connection
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
                .map_err(|error| format!("failed to finalize legacy cache cleanup: {error}"))?;
        }
        Ok(())
    }

    pub fn delete_record(&mut self, owner_id: &str, kind: SecureRecordKind) -> Result<(), String> {
        self.authorize_owner(owner_id)?;
        let crypto = self
            .crypto
            .read()
            .map_err(|_| "cache encryption state is unavailable".to_owned())?;
        let owner_scope = crypto.owner_scope(owner_id)?;
        let mut connection = self.connection()?;
        connection
            .pragma_update(None, "secure_delete", "ON")
            .map_err(|error| format!("failed to enable secure record deletion: {error}"))?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin secure record deletion: {error}"))?;
        transaction
            .execute(
                "DELETE FROM secure_records WHERE owner_scope = ?1 AND record_kind = ?2",
                params![owner_scope, kind.as_str()],
            )
            .map_err(|error| format!("failed to delete local cache record: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("failed to commit secure record deletion: {error}"))?;
        connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
            .map_err(|error| format!("failed to finalize secure record deletion: {error}"))?;
        Ok(())
    }

    pub fn clear_owner(&mut self, owner_id: &str) -> Result<(), String> {
        let identity = self.authorize_owner(owner_id)?;
        let crypto = self
            .crypto
            .read()
            .map_err(|_| "cache encryption state is unavailable".to_owned())?;
        let owner_scope = crypto.owner_scope(owner_id)?;
        let device_scope = crypto.device_scope()?;
        let mut connection = self.connection()?;
        connection
            .pragma_update(None, "secure_delete", "ON")
            .map_err(|error| format!("failed to enable secure local deletion: {error}"))?;
        let has_verified_portal_owner = read_legacy_portal(&connection, &identity)?.is_some();
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin local wipe: {error}"))?;
        transaction
            .execute(
                "DELETE FROM secure_records WHERE owner_scope = ?1",
                params![owner_scope],
            )
            .map_err(|error| format!("failed to delete owner cache: {error}"))?;
        transaction
            .execute(
                "DELETE FROM secure_records WHERE owner_scope = ?1 AND record_kind = ?2",
                params![device_scope, IDENTITY_RECORD_KIND],
            )
            .map_err(|error| format!("failed to delete desktop identity: {error}"))?;
        delete_legacy_rows(&transaction, owner_id, has_verified_portal_owner)?;
        transaction
            .commit()
            .map_err(|error| format!("failed to commit local wipe: {error}"))?;
        drop(crypto);

        let remaining_records = connection
            .query_row("SELECT COUNT(*) FROM secure_records", [], |row| {
                row.get::<_, u64>(0)
            })
            .map_err(|error| format!("failed to verify local wipe: {error}"))?;
        if remaining_records == 0 {
            let mut crypto = self
                .crypto
                .write()
                .map_err(|_| "cache encryption state is unavailable".to_owned())?;
            let replacement = CacheCrypto::rotate()?;
            *crypto = replacement;
        }
        connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
            .map_err(|error| format!("failed to finalize secure local deletion: {error}"))?;
        Ok(())
    }

    pub fn clear_all(&mut self) -> Result<(), String> {
        let mut connection = self.connection()?;
        connection
            .pragma_update(None, "secure_delete", "ON")
            .map_err(|error| format!("failed to enable secure full wipe: {error}"))?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin full local wipe: {error}"))?;
        transaction
            .execute("DELETE FROM secure_records", [])
            .map_err(|error| format!("failed to delete encrypted cache: {error}"))?;
        delete_all_legacy_rows(&transaction)?;
        transaction
            .commit()
            .map_err(|error| format!("failed to commit full local wipe: {error}"))?;

        let mut crypto = self
            .crypto
            .write()
            .map_err(|_| "cache encryption state is unavailable".to_owned())?;
        let replacement = CacheCrypto::rotate()?;
        *crypto = replacement;
        connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
            .map_err(|error| format!("failed to finalize secure full wipe: {error}"))?;
        Ok(())
    }

    fn authorize_owner(&mut self, owner_id: &str) -> Result<DesktopIdentity, String> {
        let identity = self
            .read_identity()?
            .ok_or_else(|| "desktop identity is unavailable".to_owned())?;
        if identity.owner_id != owner_id {
            return Err("OWNER_MISMATCH".to_owned());
        }
        Ok(identity)
    }

    fn connection(&self) -> Result<Connection, String> {
        open_connection(&self.database_path)
    }

    fn migrate_legacy_records(&mut self, identity: &DesktopIdentity) -> Result<(), String> {
        let crypto = self
            .crypto
            .read()
            .map_err(|_| "cache encryption state is unavailable".to_owned())?;
        let owner_scope = crypto.owner_scope(&identity.owner_id)?;
        let migration_key = format!("{LEGACY_MIGRATION_PREFIX}:{owner_scope}");
        let mut connection = self.connection()?;
        if meta_exists(&connection, &migration_key)? {
            return Ok(());
        }

        let portal_data = read_legacy_portal(&connection, identity)?;
        let has_verified_portal_owner = portal_data.is_some();
        let classroom_data = read_legacy_classroom(&connection, identity, false)?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to begin legacy migration: {error}"))?;

        if let Some(value) = &portal_data {
            migrate_legacy_record(
                &transaction,
                &crypto,
                &owner_scope,
                SecureRecordKind::PortalData,
                value,
            )?;
        }
        if let Some(value) = &classroom_data {
            migrate_legacy_record(
                &transaction,
                &crypto,
                &owner_scope,
                SecureRecordKind::ClassroomData,
                value,
            )?;
        }

        delete_legacy_rows(&transaction, &identity.owner_id, has_verified_portal_owner)?;
        if !has_legacy_rows(&transaction)? {
            transaction
                .execute(
                    "INSERT INTO secure_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    params![migration_key, Utc::now().to_rfc3339()],
                )
                .map_err(|error| format!("failed to record legacy migration: {error}"))?;
        }
        transaction
            .commit()
            .map_err(|error| format!("failed to commit legacy migration: {error}"))
    }
}

fn validate_record_owner(
    identity: &DesktopIdentity,
    kind: SecureRecordKind,
    payload: &Value,
) -> Result<(), String> {
    match kind {
        SecureRecordKind::PortalData => {
            if payload.get("userId").and_then(Value::as_str) != Some(identity.owner_id.as_str()) {
                return Err("OWNER_MISMATCH".to_owned());
            }
            if let (Some(expected_uid), Some(actual_uid)) = (
                identity.portal_uid.as_deref(),
                payload.pointer("/user/uid").and_then(Value::as_str),
            ) {
                if expected_uid != actual_uid {
                    return Err("OWNER_MISMATCH".to_owned());
                }
            }
        }
        SecureRecordKind::Bootstrap => {
            if payload.get("ownerId").and_then(Value::as_str) != Some(identity.owner_id.as_str()) {
                return Err("OWNER_MISMATCH".to_owned());
            }
        }
        SecureRecordKind::ClassroomData => {
            if payload.get("ownerId").and_then(Value::as_str) != Some(identity.owner_id.as_str()) {
                return Err("OWNER_MISMATCH".to_owned());
            }
        }
    }
    Ok(())
}

fn migrate_legacy_record(
    transaction: &Transaction<'_>,
    crypto: &CacheCrypto,
    owner_scope: &str,
    kind: SecureRecordKind,
    legacy_value: &Value,
) -> Result<(), String> {
    if can_replace_bootstrap_record(transaction, crypto, owner_scope, kind, legacy_value)? {
        write_typed_record(
            transaction,
            crypto,
            owner_scope,
            kind.as_str(),
            CACHE_SCHEMA_VERSION,
            legacy_value,
        )?;
        verify_json_record(
            transaction,
            crypto,
            owner_scope,
            kind.as_str(),
            legacy_value,
        )?;
    } else if read_json_record(transaction, crypto, owner_scope, kind.as_str())?.is_none() {
        return Err(format!(
            "encrypted {} cache verification failed",
            kind.as_str()
        ));
    }
    Ok(())
}

fn reconcile_bootstrap_record(
    transaction: &Transaction<'_>,
    crypto: &CacheCrypto,
    owner_scope: &str,
    kind: SecureRecordKind,
    reconciliation: &DesktopRecordReconciliation,
) -> Result<(), String> {
    let DesktopRecordReconciliation::Replace(incoming) = reconciliation else {
        return Ok(());
    };
    if !can_replace_bootstrap_record(transaction, crypto, owner_scope, kind, incoming)? {
        return Ok(());
    }
    write_typed_record(
        transaction,
        crypto,
        owner_scope,
        kind.as_str(),
        CACHE_SCHEMA_VERSION,
        incoming,
    )
}

fn can_replace_bootstrap_record(
    transaction: &Transaction<'_>,
    crypto: &CacheCrypto,
    owner_scope: &str,
    kind: SecureRecordKind,
    incoming: &Value,
) -> Result<bool, String> {
    let existing = read_json_record(transaction, crypto, owner_scope, kind.as_str())?;
    let Some(existing) = existing else {
        return Ok(true);
    };

    match kind {
        SecureRecordKind::PortalData => Ok(is_same_or_newer_timestamp(
            &existing,
            incoming,
            &["lastUpdated"],
        )),
        SecureRecordKind::ClassroomData => Ok(can_replace_classroom_snapshot(&existing, incoming)),
        SecureRecordKind::Bootstrap => Ok(false),
    }
}

fn can_replace_classroom_snapshot(existing: &Value, incoming: &Value) -> bool {
    if !is_same_or_newer_timestamp(existing, incoming, &["sync", "syncedAt"]) {
        return false;
    }
    let incoming_integrity = nested_string(incoming, &["sync", "integrity"]);
    if !matches!(
        incoming_integrity,
        Some("complete" | "partial" | "verified-empty")
    ) {
        return false;
    }
    let existing_is_strong = matches!(
        nested_string(existing, &["sync", "integrity"]),
        Some("complete" | "verified-empty")
    );
    !(incoming_integrity == Some("partial") && existing_is_strong)
}

fn is_same_or_newer_timestamp(existing: &Value, incoming: &Value, path: &[&str]) -> bool {
    let Some(incoming_timestamp) = nested_timestamp(incoming, path) else {
        return false;
    };
    nested_timestamp(existing, path)
        .is_none_or(|existing_timestamp| incoming_timestamp >= existing_timestamp)
}

fn nested_timestamp(value: &Value, path: &[&str]) -> Option<i64> {
    let timestamp = nested_string(value, path)
        .and_then(|timestamp| chrono::DateTime::parse_from_rfc3339(timestamp).ok())?;
    let unix_timestamp = timestamp.timestamp();
    if !(946_684_800..=Utc::now().timestamp() + 5 * 60).contains(&unix_timestamp) {
        return None;
    }
    Some(timestamp.timestamp_millis())
}

fn nested_string<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    path.iter()
        .try_fold(value, |current, segment| current.get(segment))
        .and_then(Value::as_str)
}

pub(crate) fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join("millennium.db"))
}

pub(crate) fn open_connection(path: &PathBuf) -> Result<Connection, String> {
    let connection =
        Connection::open(path).map_err(|error| format!("failed to open local cache: {error}"))?;
    connection
        .busy_timeout(std::time::Duration::from_secs(2))
        .map_err(|error| format!("failed to configure local cache: {error}"))?;
    Ok(connection)
}

fn write_typed_record<T: Serialize + ?Sized>(
    transaction: &Transaction<'_>,
    crypto: &CacheCrypto,
    owner_scope: &str,
    record_kind: &str,
    schema_version: u32,
    payload: &T,
) -> Result<(), String> {
    let plaintext = serde_json::to_vec(payload)
        .map_err(|error| format!("failed to serialize local cache: {error}"))?;
    let (nonce, ciphertext) =
        crypto.encrypt(owner_scope, record_kind, schema_version, &plaintext)?;
    transaction
        .execute(
            "INSERT INTO secure_records (owner_scope, record_kind, schema_version, nonce, ciphertext, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(owner_scope, record_kind) DO UPDATE SET
               schema_version = excluded.schema_version,
               nonce = excluded.nonce,
               ciphertext = excluded.ciphertext,
               updated_at = excluded.updated_at",
            params![
                owner_scope,
                record_kind,
                schema_version,
                nonce.as_slice(),
                ciphertext,
                Utc::now().to_rfc3339(),
            ],
        )
        .map_err(|error| format!("failed to persist encrypted cache: {error}"))?;
    Ok(())
}

fn read_typed_record<T: DeserializeOwned>(
    connection: &Connection,
    crypto: &CacheCrypto,
    owner_scope: &str,
    record_kind: &str,
) -> Result<Option<T>, String> {
    let row = connection
        .query_row(
            "SELECT schema_version, nonce, ciphertext FROM secure_records WHERE owner_scope = ?1 AND record_kind = ?2",
            params![owner_scope, record_kind],
            |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, Vec<u8>>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|error| format!("failed to read encrypted cache: {error}"))?;
    let Some((schema_version, nonce, ciphertext)) = row else {
        return Ok(None);
    };
    let plaintext = crypto.decrypt(
        owner_scope,
        record_kind,
        schema_version,
        &nonce,
        &ciphertext,
    )?;
    serde_json::from_slice(&plaintext)
        .map(Some)
        .map_err(|error| format!("failed to parse encrypted cache: {error}"))
}

fn read_json_record(
    connection: &Connection,
    crypto: &CacheCrypto,
    owner_scope: &str,
    record_kind: &str,
) -> Result<Option<Value>, String> {
    read_typed_record(connection, crypto, owner_scope, record_kind)
}

fn verify_json_record(
    connection: &Connection,
    crypto: &CacheCrypto,
    owner_scope: &str,
    record_kind: &str,
    expected: &Value,
) -> Result<(), String> {
    let stored = read_json_record(connection, crypto, owner_scope, record_kind)?;
    if stored.as_ref() != Some(expected) {
        return Err(format!("encrypted {record_kind} cache verification failed"));
    }
    Ok(())
}

fn meta_exists(connection: &Connection, key: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT 1 FROM secure_meta WHERE key = ?1",
            params![key],
            |_| Ok(()),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|error| format!("failed to inspect migration state: {error}"))
}

fn table_exists(connection: &Connection, table: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            params![table],
            |_| Ok(()),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|error| format!("failed to inspect legacy cache: {error}"))
}

fn table_columns(
    connection: &Connection,
    table: &str,
) -> Result<std::collections::HashSet<String>, String> {
    let query = format!("PRAGMA table_info({table})");
    let mut statement = connection
        .prepare(&query)
        .map_err(|error| format!("failed to inspect legacy {table} schema: {error}"))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("failed to inspect legacy {table} schema: {error}"))?;
    rows.collect::<Result<std::collections::HashSet<_>, _>>()
        .map_err(|error| format!("failed to inspect legacy {table} columns: {error}"))
}

fn read_legacy_classroom(
    connection: &Connection,
    identity: &DesktopIdentity,
    allow_ownerless: bool,
) -> Result<Option<Value>, String> {
    if !table_exists(connection, "classroom_data")? {
        return Ok(None);
    }
    let columns = table_columns(connection, "classroom_data")?;
    if columns.contains("owner_id") && columns.contains("snapshot") {
        let snapshot = read_optional_json(
            connection,
            "SELECT snapshot FROM classroom_data WHERE owner_id = ?1",
            [&identity.owner_id],
        )?;
        return Ok(snapshot.map(|mut value| {
            if let Some(record) = value.as_object_mut() {
                record.insert(
                    "ownerId".to_owned(),
                    Value::String(identity.owner_id.clone()),
                );
            }
            value
        }));
    }
    if columns.contains("id") && columns.contains("data") {
        if !allow_ownerless {
            return Ok(None);
        }
        return read_optional_json(
            connection,
            "SELECT data FROM classroom_data WHERE id = 1",
            [],
        );
    }
    Err("unsupported legacy classroom_data schema".to_owned())
}

fn read_optional_json<const N: usize>(
    connection: &Connection,
    query: &str,
    query_params: [&str; N],
) -> Result<Option<Value>, String> {
    let raw = connection
        .query_row(query, rusqlite::params_from_iter(query_params), |row| {
            row.get::<_, String>(0)
        })
        .optional();
    match raw {
        Ok(Some(value)) => serde_json::from_str(&value)
            .map(Some)
            .map_err(|error| format!("legacy cache contains invalid JSON: {error}")),
        Ok(None) => Ok(None),
        Err(error) => Err(format!("failed to read legacy cache: {error}")),
    }
}

fn read_legacy_portal(
    connection: &Connection,
    identity: &DesktopIdentity,
) -> Result<Option<Value>, String> {
    if !table_exists(connection, "portal_data")? {
        return Ok(None);
    }
    let raw = connection
        .query_row("SELECT data FROM portal_data WHERE id = 1", [], |row| {
            row.get::<_, String>(0)
        })
        .optional()
        .map_err(|error| format!("failed to read legacy portal cache: {error}"))?;
    let Some(raw) = raw else {
        return Ok(None);
    };
    let parsed: Value = serde_json::from_str(&raw)
        .map_err(|error| format!("legacy portal cache contains invalid JSON: {error}"))?;
    let Some(legacy_owner) = legacy_portal_owner(&parsed) else {
        return Ok(None);
    };
    if legacy_owner != identity.owner_id && identity.portal_uid.as_deref() != Some(legacy_owner) {
        return Ok(None);
    }
    Ok(parsed.get("data").cloned().or(Some(parsed)))
}

fn legacy_portal_owner(value: &Value) -> Option<&str> {
    value
        .get("ownerUid")
        .and_then(Value::as_str)
        .or_else(|| value.get("userId").and_then(Value::as_str))
        .or_else(|| value.pointer("/data/user/uid").and_then(Value::as_str))
        .or_else(|| value.pointer("/user/uid").and_then(Value::as_str))
}

fn delete_legacy_rows(
    transaction: &Transaction<'_>,
    owner_id: &str,
    clear_verified_portal: bool,
) -> Result<(), String> {
    if clear_verified_portal && table_exists(transaction, "portal_data")? {
        transaction
            .execute("DELETE FROM portal_data WHERE id = 1", [])
            .map_err(|error| format!("failed to remove verified legacy portal data: {error}"))?;
    }

    if table_exists(transaction, "classroom_data")? {
        let columns = table_columns(transaction, "classroom_data")?;
        if columns.contains("owner_id") {
            transaction
                .execute(
                    "DELETE FROM classroom_data WHERE owner_id = ?1",
                    params![owner_id],
                )
                .map_err(|error| format!("failed to remove legacy Classroom data: {error}"))?;
        }
    }
    Ok(())
}

fn delete_ownerless_legacy_rows(transaction: &Transaction<'_>) -> Result<bool, String> {
    let mut deleted_rows = 0usize;
    for table in [
        "user_settings",
        "notification_states",
        "local_calendars",
        "local_events",
        "google_calendar_mirror",
        "annotations",
        "meta",
    ] {
        if table_exists(transaction, table)? {
            deleted_rows += transaction
                .execute(&format!("DELETE FROM {table}"), [])
                .map_err(|error| {
                    format!("failed to purge ownerless legacy {table} data: {error}")
                })?;
        }
    }
    if table_exists(transaction, "classroom_data")? {
        let columns = table_columns(transaction, "classroom_data")?;
        if !columns.contains("owner_id") && columns.contains("id") {
            deleted_rows += transaction
                .execute("DELETE FROM classroom_data WHERE id = 1", [])
                .map_err(|error| {
                    format!("failed to purge ownerless legacy Classroom data: {error}")
                })?;
        }
    }
    Ok(deleted_rows > 0)
}

fn has_legacy_rows(connection: &Connection) -> Result<bool, String> {
    for table in [
        "portal_data",
        "classroom_data",
        "user_settings",
        "notification_states",
        "local_calendars",
        "local_events",
        "google_calendar_mirror",
        "annotations",
        "meta",
    ] {
        if !table_exists(connection, table)? {
            continue;
        }
        let query = format!("SELECT EXISTS(SELECT 1 FROM {table} LIMIT 1)");
        let has_rows = connection
            .query_row(&query, [], |row| row.get::<_, bool>(0))
            .map_err(|error| format!("failed to inspect legacy {table} data: {error}"))?;
        if has_rows {
            return Ok(true);
        }
    }
    Ok(false)
}

fn delete_all_legacy_rows(transaction: &Transaction<'_>) -> Result<(), String> {
    for table in [
        "portal_data",
        "classroom_data",
        "user_settings",
        "notification_states",
        "local_calendars",
        "local_events",
        "google_calendar_mirror",
        "annotations",
        "sync_queue",
        "sync_conflicts",
        "meta",
    ] {
        if table_exists(transaction, table)? {
            transaction
                .execute(&format!("DELETE FROM {table}"), [])
                .map_err(|error| format!("failed to clear legacy {table} data: {error}"))?;
        }
    }
    Ok(())
}
