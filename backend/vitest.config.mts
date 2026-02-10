import path from "node:path";
import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

// Load .env so TEST_DATABASE_URL is available
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Use a separate test database so running tests never wipes dev data (interviews, users, etc.)
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false
  }
});
