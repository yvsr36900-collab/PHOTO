-- SnapGather — Supabase / Postgres Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run

CREATE TABLE IF NOT EXISTS users (
  id               BIGSERIAL PRIMARY KEY,
  email            TEXT UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  plan             TEXT NOT NULL DEFAULT 'free',
  google_access_token  TEXT,
  google_refresh_token TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id                  BIGSERIAL PRIMARY KEY,
  join_code           TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  occasion_type       TEXT NOT NULL,
  host_user_id        BIGINT REFERENCES users(id),
  duration_minutes    INTEGER NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  stopped_at          TIMESTAMPTZ,
  guest_list_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_members (
  id           BIGSERIAL PRIMARY KEY,
  session_id   BIGINT REFERENCES sessions(id),
  user_id      TEXT NOT NULL,
  display_name TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  joined_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS photos (
  id                   BIGSERIAL PRIMARY KEY,
  session_id           BIGINT REFERENCES sessions(id),
  uploaded_by_user_id  TEXT NOT NULL,
  uploaded_by_name     TEXT NOT NULL,
  storage_path         TEXT NOT NULL,
  url                  TEXT NOT NULL,
  original_name        TEXT NOT NULL,
  uploaded_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rsvps (
  id          BIGSERIAL PRIMARY KEY,
  session_id  BIGINT REFERENCES sessions(id),
  guest_name  TEXT NOT NULL,
  status      TEXT NOT NULL CHECK(status IN ('attending', 'not_attending')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_allowlist (
  id          BIGSERIAL PRIMARY KEY,
  session_id  BIGINT REFERENCES sessions(id),
  name        TEXT NOT NULL,
  added_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_sessions_join_code      ON sessions(join_code);
CREATE INDEX IF NOT EXISTS idx_sessions_host_user_id   ON sessions(host_user_id);
CREATE INDEX IF NOT EXISTS idx_photos_session_id        ON photos(session_id);
CREATE INDEX IF NOT EXISTS idx_session_members_session  ON session_members(session_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_session_id         ON rsvps(session_id);
CREATE INDEX IF NOT EXISTS idx_allowlist_session_id     ON session_allowlist(session_id);
