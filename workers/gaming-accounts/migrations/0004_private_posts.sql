CREATE TABLE IF NOT EXISTS private_posts (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS private_post_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS private_post_assets (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS private_post_asset_chunks (
  asset_id TEXT NOT NULL, part INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(asset_id, part)
);
