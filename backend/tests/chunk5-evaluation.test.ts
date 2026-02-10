import request from "supertest";
import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { seedAll } from "../src/db/seed";
import { pool } from "../src/db/pool";
import { prepareDatabase } from "./helpers";
import { EVALUATION_VERSION } from "../src/services/evaluation/types";
import { setGenerateAssistantResponseImpl } from "../src/services/assistant/llm";

async function getOpsToken(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: env.OPS_ADMIN_EMAIL, password: env.OPS_ADMIN_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function getRoleId(app: ReturnType<typeof createApp>, opsToken: string): Promise<string> {
  const res = await request(app).get("/api/roles").set("Authorization", `Bearer ${opsToken}`);
  expect(res.status).toBe(200);
  return res.body.roles[0].id;
}

async function completeInterview(app: ReturnType<typeof createApp>) {
  const opsToken = await getOpsToken(app);
  const roleId = await getRoleId(app, opsToken);
  const inviteRes = await request(app)
    .post("/api/interview-invites")
    .set("Authorization", `Bearer ${opsToken}`)
    .send({ role_id: roleId });
  const token = inviteRes.body.token;
  const sessionRes = await request(app).get(`/api/talent/session?token=${token}`);
  const interviewId = sessionRes.body.interview_id;
  await request(app)
    .post(`/api/talent/interviews/${interviewId}/start`)
    .set("X-Invite-Token", token);

  for (let i = 1; i <= 5; i++) {
    await request(app)
      .post(`/api/talent/interviews/${interviewId}/messages`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: `msg-s${i}-1`, text: `Section ${i} response: we consider metrics and constraints.` });
    await request(app)
      .post(`/api/talent/interviews/${interviewId}/section-done`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: `done-s${i}` });
  }

  const statusRes = await request(app)
    .get(`/api/talent/interviews/${interviewId}/snapshot`)
    .set("X-Invite-Token", token);
  expect(statusRes.body.status).toBe("COMPLETED");

  return { interviewId, opsToken };
}

describe("Chunk 5: Deterministic Evaluation + Ops APIs", () => {
  afterEach(() => {
    setGenerateAssistantResponseImpl(null);
  });

  test("1) Evaluation endpoint rejects if interview not completed (409)", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const opsToken = await getOpsToken(app);
    const roleId = await getRoleId(app, opsToken);
    const inviteRes = await request(app)
      .post("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ role_id: roleId });
    const token = inviteRes.body.token;
    const sessionRes = await request(app).get(`/api/talent/session?token=${token}`);
    const interviewId = sessionRes.body.interview_id;
    await request(app)
      .post(`/api/talent/interviews/${interviewId}/start`)
      .set("X-Invite-Token", token);

    const res = await request(app)
      .post(`/api/ops/interviews/${interviewId}/evaluate`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not COMPLETED|cannot evaluate/i);
  });

  test("2) Complete interview then evaluate returns evaluation_version ess-v1, metrics with evidence, overall_score", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId, opsToken } = await completeInterview(app);

    const res = await request(app)
      .post(`/api/ops/interviews/${interviewId}/evaluate`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(res.status).toBe(200);
    expect(res.body.evaluation_version).toBe(EVALUATION_VERSION);
    expect(res.body.overall_score).not.toBeNull();
    expect(Array.isArray(res.body.metrics)).toBe(true);
    expect(res.body.metrics.length).toBeGreaterThan(0);
    for (const m of res.body.metrics) {
      expect(Array.isArray(m.evidence)).toBe(true);
    }
  });

  test("3) Idempotency: evaluate twice returns same output, no duplicate rows", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId, opsToken } = await completeInterview(app);

    const first = await request(app)
      .post(`/api/ops/interviews/${interviewId}/evaluate`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(first.status).toBe(200);
    const firstScore = first.body.overall_score;

    const second = await request(app)
      .post(`/api/ops/interviews/${interviewId}/evaluate`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(second.status).toBe(200);
    expect(second.body.overall_score).toBe(firstScore);
    expect(second.body.evaluation_version).toBe(first.body.evaluation_version);

    const rows = await pool.query("SELECT id FROM evaluation_results WHERE interview_id = $1", [interviewId]);
    expect(rows.rowCount).toBe(1);
  });

  test("4) Every metric has evidence array (may be empty for implementation_quality if no code)", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId, opsToken } = await completeInterview(app);

    const res = await request(app)
      .post(`/api/ops/interviews/${interviewId}/evaluate`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(res.status).toBe(200);
    for (const m of res.body.metrics) {
      expect(m).toHaveProperty("evidence");
      expect(Array.isArray(m.evidence)).toBe(true);
    }
  });

  test("5) Assistant is context-only: scores identical with/without assistant usage", async () => {
    setGenerateAssistantResponseImpl(async () => ({ text: "AUC is area under the ROC curve." }));
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId: id1, opsToken } = await completeInterview(app);
    const eval1 = await request(app)
      .post(`/api/ops/interviews/${id1}/evaluate`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(eval1.status).toBe(200);
    const score1 = eval1.body.overall_score;

    const opsToken2 = await getOpsToken(app);
    const roleId2 = await getRoleId(app, opsToken2);
    const invite2 = await request(app)
      .post("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken2}`)
      .send({ role_id: roleId2 });
    const token2 = invite2.body.token;
    const session2 = await request(app).get(`/api/talent/session?token=${token2}`);
    const id2 = session2.body.interview_id;
    await request(app).post(`/api/talent/interviews/${id2}/start`).set("X-Invite-Token", token2);
    for (let i = 1; i <= 4; i++) {
      await request(app)
        .post(`/api/talent/interviews/${id2}/messages`)
        .set("X-Invite-Token", token2)
        .send({ client_event_id: `m2-s${i}`, text: `Section ${i} response: we consider metrics and constraints.` });
      await request(app)
        .post(`/api/talent/interviews/${id2}/assistant/query`)
        .set("X-Invite-Token", token2)
        .send({ client_event_id: `assist-${i}`, text: "What is AUC?" });
      await request(app)
        .post(`/api/talent/interviews/${id2}/section-done`)
        .set("X-Invite-Token", token2)
        .send({ client_event_id: `done2-s${i}` });
    }
    const eval2 = await request(app)
      .post(`/api/ops/interviews/${id2}/evaluate`)
      .set("Authorization", `Bearer ${opsToken2}`);
    expect(eval2.status).toBe(200);
    expect(eval2.body.context.assistant_usage_count).toBeGreaterThan(0);
    expect(eval2.body.overall_score).toBe(score1);
  });

  test("6) GET evaluation returns 404 when no evaluation", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const opsToken = await getOpsToken(app);
    const roleId = await getRoleId(app, opsToken);
    const inviteRes = await request(app)
      .post("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ role_id: roleId });
    const token = inviteRes.body.token;
    const sessionRes = await request(app).get(`/api/talent/session?token=${token}`);
    const interviewId = sessionRes.body.interview_id;

    const res = await request(app)
      .get(`/api/ops/interviews/${interviewId}/evaluation`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(res.status).toBe(404);
  });

  test("7) GET replay returns section transcript and assistant usage", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId, opsToken } = await completeInterview(app);

    const res = await request(app)
      .get(`/api/ops/interviews/${interviewId}/replay`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(res.status).toBe(200);
    expect(res.body.interview_id).toBe(interviewId);
    expect(Array.isArray(res.body.sections)).toBe(true);
    expect(res.body).toHaveProperty("assistant_usage");
    expect(res.body).toHaveProperty("section_timing");
    expect(res.body).toHaveProperty("disconnect_count");
  });
});
