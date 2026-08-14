-- Offline Study store.
--
-- Shares the database file opened by 004 and follows the same rule: entity payloads and queued
-- review commands are stored only as ciphertext, scoped by the same owner HMAC.
--
-- `study_outbox.sequence` gives queued reviews a stable submission order that survives restarts,
-- and the unique operation id makes a replayed review a no-op instead of a duplicate.
--
-- Applied with `execute_batch` on every open, so every statement must be idempotent.

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS study_entities (
  owner_scope    TEXT    NOT NULL,
  entity_kind    TEXT    NOT NULL,
  entity_id      TEXT    NOT NULL,
  revision       INTEGER NOT NULL DEFAULT 0,
  schema_version INTEGER NOT NULL,
  nonce          BLOB    NOT NULL,
  ciphertext     BLOB    NOT NULL,
  updated_at     TEXT    NOT NULL,
  PRIMARY KEY (owner_scope, entity_kind, entity_id)
);

CREATE TABLE IF NOT EXISTS study_outbox (
  sequence        INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_scope     TEXT    NOT NULL,
  operation_id    TEXT    NOT NULL,
  operation_kind  TEXT    NOT NULL,
  card_id         TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending',
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  schema_version  INTEGER NOT NULL,
  nonce           BLOB    NOT NULL,
  ciphertext      BLOB    NOT NULL,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  UNIQUE (owner_scope, operation_id)
);

-- Serves the pending/conflict reads and the status counts, which always filter by owner and
-- status and then order by submission sequence.
CREATE INDEX IF NOT EXISTS study_outbox_owner_status_sequence
  ON study_outbox (owner_scope, status, sequence);

CREATE TABLE IF NOT EXISTS study_sync_meta (
  owner_scope    TEXT    NOT NULL PRIMARY KEY,
  cursor         INTEGER NOT NULL DEFAULT 0,
  device_id      TEXT    NOT NULL,
  last_pulled_at TEXT,
  last_pushed_at TEXT,
  updated_at     TEXT    NOT NULL
);
