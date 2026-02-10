import { describe, expect, test } from "vitest";
import { pool } from "../src/db/pool";
import { assertLocalPostgresForTests } from "./helpers";

describe("database connection", () => {
  test("connects to local Postgres", async () => {
    assertLocalPostgresForTests();
    const result = await pool.query<{ connected: number }>("SELECT 1 AS connected");
    expect(result.rows[0]?.connected).toBe(1);
  });
});
