import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { pool } from "./pool";

export async function seedRoles(): Promise<void> {
  await pool.query(
    `
      INSERT INTO roles (name, schema_version, is_active)
      VALUES ($1, $2, true)
      ON CONFLICT (name, schema_version) DO NOTHING
    `,
    ["Machine Learning Engineer", "mle-v1"]
  );
}

export async function seedOpsAdmin(): Promise<void> {
  const passwordHash = await bcrypt.hash(env.OPS_ADMIN_PASSWORD, 10);
  await pool.query(
    `
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, 'OPS_ADMIN')
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        updated_at = NOW()
    `,
    [env.OPS_ADMIN_EMAIL, passwordHash]
  );
}

export async function seedAll(): Promise<void> {
  await seedRoles();
  await seedOpsAdmin();
  console.log(`Seeded roles and ops admin (${env.OPS_ADMIN_EMAIL}).`);
}
