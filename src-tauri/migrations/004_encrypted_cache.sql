-- Encrypted desktop cache.
--
-- Every payload is stored as AES-256-GCM ciphertext keyed by an OS credential-store master key,
-- so this schema deliberately holds no plaintext user data. `owner_scope` is an HMAC of the owner
-- id rather than the id itself, which keeps account identifiers out of the database file as well.
--
-- Applied with `execute_batch` on every open, so every statement must be idempotent.

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- A rowid table on purpose: cached portal and Classroom snapshots are large blobs, and WITHOUT
-- ROWID stores them inline in the index b-tree, which is slower for exactly this shape of row.
CREATE TABLE IF NOT EXISTS secure_records (
  owner_scope    TEXT    NOT NULL,
  record_kind    TEXT    NOT NULL,
  schema_version INTEGER NOT NULL,
  nonce          BLOB    NOT NULL,
  ciphertext     BLOB    NOT NULL,
  updated_at     TEXT    NOT NULL,
  PRIMARY KEY (owner_scope, record_kind)
);

CREATE TABLE IF NOT EXISTS secure_meta (
  key   TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
);
