import { Pool } from "pg";

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Insert a test title
    const titleResult = await pool.query(`
      INSERT INTO titles (id, name, manifest_url, drm_enabled)
      VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Sample Audiobook', 'https://example.com/manifest.mpd', true)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `);

    const titleId = titleResult.rows[0]?.id || 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    console.log(`[seed] Title: ${titleId}`);

    // Insert a DRM key
    await pool.query(`
      INSERT INTO drm_keys (title_id, kid, encrypted_key)
      VALUES ($1, 'kid-001', 'placeholder-encrypted-key-base64')
      ON CONFLICT DO NOTHING
    `, [titleId]);
    console.log(`[seed] DRM key for title ${titleId}`);

    // Insert an entitlement for test user
    await pool.query(`
      INSERT INTO entitlements (user_id, title_id, access_type, max_concurrent_streams, offline_allowed)
      VALUES ('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', $1, 'stream', 2, false)
      ON CONFLICT DO NOTHING
    `, [titleId]);
    console.log(`[seed] Entitlement for test user`);

    console.log("Seed complete.");
  } finally {
    await pool.end();
  }
}

seed();
