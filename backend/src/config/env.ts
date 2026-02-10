import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({
  path: path.resolve(process.cwd(), ".env")
});

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  OPS_ADMIN_EMAIL: z.string().email().default("ops-admin@example.com"),
  OPS_ADMIN_PASSWORD: z.string().min(8).default("ops-admin-password"),
  INVITE_BASE_URL: z.string().url().default("http://localhost:3000"),
  /** Comma-separated origins for CORS (e.g. https://yourapp.vercel.app). */
  FRONTEND_ORIGIN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issueText = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment variables: ${issueText}`);
}

export const env = parsed.data;
