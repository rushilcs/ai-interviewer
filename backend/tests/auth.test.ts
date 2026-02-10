import request from "supertest";
import { describe, expect, test } from "vitest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { seedAll } from "../src/db/seed";
import { prepareDatabase } from "./helpers";

describe("ops auth", () => {
  test("POST /api/auth/login returns 400 for invalid body", async () => {
    await prepareDatabase();
    const app = createApp();
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test("GET /api/auth/me returns 401 without token", async () => {
    await prepareDatabase();
    const app = createApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/token|Unauthorized/i);
  });

  test("login and me return seeded ops admin", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();

    const loginResponse = await request(app).post("/api/auth/login").send({
      email: env.OPS_ADMIN_EMAIL,
      password: env.OPS_ADMIN_PASSWORD
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.email).toBe(env.OPS_ADMIN_EMAIL);
    expect(loginResponse.body.user.role).toBe("OPS_ADMIN");
    expect(typeof loginResponse.body.token).toBe("string");

    const meResponse = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginResponse.body.token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe(env.OPS_ADMIN_EMAIL);
    expect(meResponse.body.user.role).toBe("OPS_ADMIN");
  });
});
