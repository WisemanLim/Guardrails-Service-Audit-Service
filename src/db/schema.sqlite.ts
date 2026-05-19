/**
 * SQLite schema for the Audit Service (local / lightweight ops).
 *
 * Differences from the Postgres schema:
 *   - TEXT[] columns → TEXT (JSON-encoded array)
 *   - BYTEA → BLOB
 *   - TIMESTAMPTZ → TEXT (ISO 8601 via datetime('now'))
 *   - gen_random_uuid() → UUID generated in Node
 *   - NUMERIC → REAL
 */
export const AUDIT_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS decision_events (
  decision_id    TEXT PRIMARY KEY,
  tenant_id      TEXT,
  session_id     TEXT,
  domain         TEXT NOT NULL,
  locale         TEXT NOT NULL,
  io_type        TEXT NOT NULL,
  text_hash      TEXT NOT NULL,
  text_encrypted BLOB,
  decision       TEXT NOT NULL,
  risk_score     REAL NOT NULL DEFAULT 0,
  matched_rules  TEXT NOT NULL DEFAULT '[]',
  categories     TEXT NOT NULL DEFAULT '[]',
  policy_version TEXT,
  latency_ms     INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON decision_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_domain_time ON decision_events(domain, created_at DESC);
`;
