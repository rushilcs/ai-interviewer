import { Pool } from "pg";
import { env } from "../config/env";

/** Render external Postgres requires SSL; internal URL does not. */
const useSsl = env.DATABASE_URL.includes("render.com");

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ...(useSsl && { ssl: { rejectUnauthorized: true } }),
});

export async function assertDatabaseConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}
