CREATE TABLE IF NOT EXISTS entitlements (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  title_id UUID NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  access_type TEXT NOT NULL DEFAULT 'stream',
  expires_at TIMESTAMPTZ,
  max_concurrent_streams INT NOT NULL DEFAULT 1,
  offline_allowed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_entitlements_user_title ON entitlements(user_id, title_id);
