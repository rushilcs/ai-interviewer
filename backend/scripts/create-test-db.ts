/**
 * Creates the test database from TEST_DATABASE_URL if it doesn't exist.
 * Run once: npm run test:db:create
 * Requires Postgres to be running and TEST_DATABASE_URL in .env.
 */
import dotenv from "dotenv";
import path from "path";
import { Pool } from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error("TEST_DATABASE_URL is not set in .env");
  process.exit(1);
}

let dbName: string;
let connectUrl: string;
try {
  const u = new URL(testUrl);
  dbName = u.pathname.replace(/^\//, "") || "ai_interviewer_test";
  u.pathname = "/postgres";
  connectUrl = u.toString();
} catch {
  console.error("Invalid TEST_DATABASE_URL");
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: connectUrl });
  try {
    const r = await pool.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [dbName]
    );
    if (r.rows[0]?.exists) {
      console.log(`Database "${dbName}" already exists.`);
      return;
    }
    const safeName = dbName.replace(/"/g, '""');
    await pool.query(`CREATE DATABASE "${safeName}"`);
    console.log(`Created database "${dbName}".`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
