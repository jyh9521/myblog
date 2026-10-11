CREATE TABLE IF NOT EXISTS gaming_store_links (
  platform TEXT NOT NULL CHECK(platform IN ('xbox','psn','nintendo')),
  game_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  cover TEXT,
  source TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(platform, game_id)
);
