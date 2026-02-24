CREATE TABLE IF NOT EXISTS stream_sessions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  title_id UUID NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_stream_sessions_active ON stream_sessions(user_id, active);
