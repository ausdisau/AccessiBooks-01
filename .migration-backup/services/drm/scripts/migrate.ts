import { Pool } from "pg";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Ensure schema_migrations table exists first
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = join(__dirname, "../src/db/migrations");
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: applied } = await pool.query(
      "SELECT filename FROM schema_migrations"
    );
    const appliedSet = new Set(applied.map((r: any) => r.filename));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[skip] ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(join(migrationsDir, file), "utf-8");
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
        await pool.query("COMMIT");
        console.log(`[done] ${file}`);
      } catch (err) {
        await pool.query("ROLLBACK");
        console.error(`[fail] ${file}:`, err);
        process.exit(1);
      }
    }

    console.log("All migrations applied.");
  } finally {
    await pool.end();
  }
}

migrate();
