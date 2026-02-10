import { pool } from "./pool";
import { runMigrations } from "./migrationRunner";

async function main(): Promise<void> {
  const applied = await runMigrations();
  if (applied.length === 0) {
    console.log("No new migrations to apply.");
  } else {
    console.log(`Applied migrations: ${applied.join(", ")}`);
  }
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
