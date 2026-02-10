import { describe, expect, test } from "vitest";
import { pool } from "../src/db/pool";
import { prepareDatabase } from "./helpers";

describe("migrations", () => {
  test("create all required tables", async () => {
    await prepareDatabase();

    const result = await pool.query<{ table_name: string }>(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
      `
    );

    const tableNames = result.rows.map((row) => row.table_name);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        "users",
        "roles",
        "interview_invites",
        "interviews",
        "interview_events",
        "evaluation_jobs",
        "evaluation_results",
        "schema_migrations"
      ])
    );
  });
});
