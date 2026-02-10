import { URL } from "node:url";
import { pool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrationRunner";

export function assertLocalPostgresForTests(): void {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is required for tests");
  }

  const parsed = new URL(dbUrl);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "5432") {
    throw new Error("Tests must run against local Postgres on 127.0.0.1:5432");
  }
}

export async function resetPublicSchema(): Promise<void> {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
}

export async function prepareDatabase(): Promise<void> {
  assertLocalPostgresForTests();
  await resetPublicSchema();
  await runMigrations();
}
