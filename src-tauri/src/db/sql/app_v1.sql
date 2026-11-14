-- app.db v1: the engagement index, app settings and run profiles (PRD §10.2 notes).
CREATE TABLE engagement (
  id             TEXT PRIMARY KEY,          -- uuid, also the folder name
  name           TEXT NOT NULL,
  client         TEXT,
  notes          TEXT,
  path           TEXT NOT NULL,             -- relative to the data folder, so the folder can move (SET-07)
  created_at     INTEGER NOT NULL,
  archived_at    INTEGER,
  last_opened_at INTEGER
);
-- ENG-01: names are unique among active engagements.
CREATE UNIQUE INDEX ux_engagement_name_active ON engagement(name COLLATE NOCASE) WHERE archived_at IS NULL;

CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE profile (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, json TEXT NOT NULL, builtin INTEGER NOT NULL DEFAULT 0);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
