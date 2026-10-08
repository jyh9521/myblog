CREATE TABLE IF NOT EXISTS hltb_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT,
  cached_at INTEGER NOT NULL DEFAULT 0,
  retry_after INTEGER NOT NULL DEFAULT 0
);
