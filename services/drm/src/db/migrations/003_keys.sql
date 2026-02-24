CREATE TABLE IF NOT EXISTS drm_keys (
  id SERIAL PRIMARY KEY,
  title_id UUID NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  kid TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drm_keys_title_id ON drm_keys(title_id);
