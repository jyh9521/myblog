CREATE TABLE IF NOT EXISTS gaming_configuration (
  name TEXT PRIMARY KEY CHECK(name = 'STEAM_API_KEY'),
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
