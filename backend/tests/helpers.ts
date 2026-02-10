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

/**
 * Ensure tests run against a dedicated test DB so we never wipe dev data.
 * Call this before resetPublicSchema.
 */
function assertTestDatabase(): void {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const testUrl = process.env.TEST_DATABASE_URL;
  const name = (() => {
    try {
      return new URL(dbUrl).pathname.replace(/^\//, "") || "";
    } catch {
      return "";
    }
  })();
  if (!testUrl && !name.endsWith("_test") && !/test$/i.test(name)) {
    throw new Error(
      "Tests DROP and recreate the public schema, which would delete all your dev data (interviews, users, etc.). " +
        "Use a separate test database: create it (e.g. createdb ai_interviewer_test), add TEST_DATABASE_URL to .env " +
        '(e.g. TEST_DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/ai_interviewer_test), then run tests again.'
    );
  }
}

export async function resetPublicSchema(): Promise<void> {
  assertTestDatabase();
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
}

export async function prepareDatabase(): Promise<void> {
  assertLocalPostgresForTests();
  await resetPublicSchema();
  await runMigrations();
}
