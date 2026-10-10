CREATE TABLE gaming_accounts (
  platform TEXT PRIMARY KEY CHECK(platform IN ('xbox','psn','nintendo','steam','gog','epic')),
  account_id TEXT NOT NULL, display_name TEXT NOT NULL,
  credential TEXT NOT NULL, bound_at TEXT NOT NULL,
  last_attempt_at TEXT, last_success_at TEXT,
  status TEXT NOT NULL DEFAULT 'connected', error_code TEXT,
  public_json TEXT, sync_lock_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE gaming_auth_states (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL, owner TEXT NOT NULL,
  verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE gaming_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT NOT NULL, status TEXT NOT NULL,
  error_code TEXT, games INTEGER
);
CREATE TABLE gaming_login_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL);
