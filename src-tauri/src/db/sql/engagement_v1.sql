-- engagement.db v1: PRD §10.2. One database per engagement (§10.1).
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- schema_version, engagement_id, authorized_by, authorized_at,
-- third_party_policy (ask|probe|skip, SCOPE-11), cdn_as_third_party (0|1, §12.4)

CREATE TABLE scope_rule (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('domain','wildcard','pattern','ip','cidr')),
  effect      TEXT NOT NULL CHECK (effect IN ('in','out')),
  pattern     TEXT NOT NULL,          -- as entered
  normalized  TEXT NOT NULL,          -- lowercase, punycode, canonical CIDR
  note        TEXT,
  created_at  INTEGER NOT NULL,
  UNIQUE (kind, effect, normalized)
);

CREATE TABLE run (
  id          INTEGER PRIMARY KEY,
  profile     TEXT NOT NULL,          -- full profile JSON, versioned
  state       TEXT NOT NULL,          -- queued|running|pausing|paused|stopping|completed|stopped|failed|interrupted
  started_at  INTEGER, ended_at INTEGER,
  error       TEXT
);

CREATE TABLE run_stage (
  run_id      INTEGER NOT NULL REFERENCES run(id),
  stage       TEXT NOT NULL,          -- enumerate|bruteforce|resolve|probe
  state       TEXT NOT NULL,          -- pending|running|paused|done|failed|skipped
  tool        TEXT NOT NULL, tool_version TEXT NOT NULL,
  args        TEXT NOT NULL,          -- JSON, secrets removed
  in_count    INTEGER DEFAULT 0, out_count INTEGER DEFAULT 0,
  drop_count  INTEGER DEFAULT 0, error_count INTEGER DEFAULT 0,
  PRIMARY KEY (run_id, stage)
);

CREATE TABLE run_chunk (
  id          INTEGER PRIMARY KEY,
  run_id      INTEGER NOT NULL REFERENCES run(id),
  stage       TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  inputs      TEXT NOT NULL,          -- newline-separated
  state       TEXT NOT NULL,          -- pending|running|done|failed|skipped
  attempts    INTEGER DEFAULT 0,
  error       TEXT,
  parse_errors   INTEGER DEFAULT 0,   -- lines the adapter could not parse (RUN-16)
  unknown_fields TEXT,                -- JSON array of field names new to the adapter (RUN-16)
  UNIQUE (run_id, stage, seq)
);

CREATE TABLE subdomain (
  id              INTEGER PRIMARY KEY,
  host            TEXT NOT NULL UNIQUE,   -- lowercase, punycode
  root_domain     TEXT NOT NULL,
  sources         TEXT,                   -- JSON array
  resolved        INTEGER NOT NULL DEFAULT 0,
  wildcard        INTEGER NOT NULL DEFAULT 0,
  hidden_by_scope INTEGER NOT NULL DEFAULT 0,
  scope_state     TEXT NOT NULL DEFAULT 'in'
                  CHECK (scope_state IN ('in','pending')),  -- SCOPE-10
  third_party     TEXT,                   -- provider name or 'unknown'; NULL if not flagged (SCOPE-11)
  third_party_target TEXT,                -- the CNAME target that caused the flag
  probe_decision  TEXT CHECK (probe_decision IN ('held','probe','skip')),  -- NULL if not flagged
  first_seen_run  INTEGER NOT NULL, last_seen_run INTEGER NOT NULL,
  first_seen_at   INTEGER NOT NULL, last_seen_at  INTEGER NOT NULL
);

CREATE TABLE third_party_decision (       -- remembered choices, per engagement (SCOPE-11)
  id          INTEGER PRIMARY KEY,
  match_kind  TEXT NOT NULL CHECK (match_kind IN ('host','provider')),
  value       TEXT NOT NULL,              -- hostname, or provider name
  decision    TEXT NOT NULL CHECK (decision IN ('probe','skip')),
  decided_by  TEXT NOT NULL,              -- OS user name
  decided_at  INTEGER NOT NULL,
  UNIQUE (match_kind, value)
);

CREATE TABLE dns_record (
  id           INTEGER PRIMARY KEY,
  subdomain_id INTEGER NOT NULL REFERENCES subdomain(id),
  type         TEXT NOT NULL,             -- A|AAAA|CNAME
  value        TEXT NOT NULL,
  last_seen_run INTEGER NOT NULL,
  UNIQUE (subdomain_id, type, value)
);

CREATE TABLE http_service (
  id             INTEGER PRIMARY KEY,
  subdomain_id   INTEGER NOT NULL REFERENCES subdomain(id),
  url            TEXT NOT NULL UNIQUE,
  scheme         TEXT NOT NULL, port INTEGER NOT NULL,
  status_code    INTEGER, title TEXT, web_server TEXT,
  content_type   TEXT, content_length INTEGER, response_ms INTEGER,
  tech           TEXT,                    -- JSON array
  ip             TEXT, cdn TEXT,
  location       TEXT,                    -- redirect target, not followed
  error          TEXT,                    -- timeout|reset|tls|...
  first_seen_run INTEGER NOT NULL, last_seen_run INTEGER NOT NULL,
  last_seen_at   INTEGER NOT NULL
);

CREATE TABLE scope_drop (
  id      INTEGER PRIMARY KEY,
  run_id  INTEGER NOT NULL REFERENCES run(id),
  stage   TEXT NOT NULL,
  value   TEXT NOT NULL,
  reason  TEXT NOT NULL,                  -- no_in_scope_match|out_rule|ip_out_rule
  rule_id INTEGER REFERENCES scope_rule(id),
  at      INTEGER NOT NULL
);

CREATE TABLE saved_filter (
  id INTEGER PRIMARY KEY, view TEXT NOT NULL, name TEXT NOT NULL, query TEXT NOT NULL,
  UNIQUE (view, name)
);

CREATE INDEX ix_sub_root      ON subdomain(root_domain);
CREATE INDEX ix_sub_firstrun  ON subdomain(first_seen_run);
CREATE INDEX ix_http_status   ON http_service(status_code);
CREATE INDEX ix_http_sub      ON http_service(subdomain_id);
CREATE INDEX ix_dns_value     ON dns_record(value);
CREATE INDEX ix_drop_run      ON scope_drop(run_id, stage);
