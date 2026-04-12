-- Run locally:  npm run db:init
-- Run remotely: wrangler d1 execute morning-digest-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS swipes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  article_url TEXT    NOT NULL,
  action      TEXT    NOT NULL CHECK (action IN ('save', 'skip')),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_articles (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  TEXT NOT NULL,
  title    TEXT NOT NULL,
  source   TEXT NOT NULL,
  url      TEXT NOT NULL,
  hook     TEXT,
  saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_unique ON saved_articles (user_id, url);
CREATE INDEX IF NOT EXISTS idx_swipes_user        ON swipes (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_user         ON saved_articles (user_id);
