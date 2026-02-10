import fs from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { pool } from "./pool";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function runMigrations(): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureMigrationTable(client);

    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    const applied = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations"
    );
    const appliedSet = new Set(applied.rows.map((row) => row.filename));
    const newlyApplied: string[] = [];

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      const migrationSql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query(migrationSql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      newlyApplied.push(file);
    }

    await client.query("COMMIT");
    return newlyApplied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
