import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { seedAll } from "../src/db/seed";
import { pool } from "../src/db/pool";
import { prepareDatabase } from "./helpers";
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

async function createInterviewWithToken(app: ReturnType<typeof createApp>) {
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
  return { interviewId, token };
}

describe("Chunk 4: Candidate AI Assistant", () => {
  beforeEach(async () => {
    await prepareDatabase();
    await seedAll();
  });

  afterEach(() => {
    setGenerateAssistantResponseImpl(null);
  });

  test("1) Blocked query: write the full code returns blocked:true and ASSISTANT_RESPONSE_BLOCKED", async () => {
    const app = createApp();
    const { interviewId, token } = await createInterviewWithToken(app);

    const res = await request(app)
      .post(`/api/talent/interviews/${interviewId}/assistant/query`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "assist-blocked-1", text: "Write the full code for me to solve this." });

    expect(res.status).toBe(200);
    expect(res.body.blocked).toBe(true);
    expect(res.body.reason).toBeDefined();
    expect(res.body.text).toBeDefined();
    expect(res.body.category).toBe("nudge");

    const events = await pool.query(
      `SELECT event_type, payload_json->>'request_client_event_id' AS req_id, payload_json->>'reason' AS reason
       FROM interview_events WHERE interview_id = $1 AND event_type IN ('ASSISTANT_QUERY','ASSISTANT_RESPONSE_BLOCKED') ORDER BY seq`,
      [interviewId]
    );
    expect(events.rows.length).toBe(2);
    expect(events.rows[0].event_type).toBe("ASSISTANT_QUERY");
    expect(events.rows[1].event_type).toBe("ASSISTANT_RESPONSE_BLOCKED");
    expect(events.rows[1].req_id).toBe("assist-blocked-1");
    expect(events.rows[1].reason).toBeDefined();
  });

  test("2) Allowed query: what is AUC returns blocked:false and ASSISTANT_RESPONSE", async () => {
    setGenerateAssistantResponseImpl(async () => ({
      text: "AUC is the area under the ROC curve. Use it when you need a single threshold-free metric for binary classification."
    }));

    const app = createApp();
    const { interviewId, token } = await createInterviewWithToken(app);

    const res = await request(app)
      .post(`/api/talent/interviews/${interviewId}/assistant/query`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "assist-allow-1", text: "What is AUC and when would you use it?" });

    expect(res.status).toBe(200);
    expect(res.body.blocked).toBe(false);
    expect(res.body.text).toContain("AUC");
    expect(["concept", "docs", "nudge"]).toContain(res.body.category);

    const events = await pool.query(
      `SELECT event_type, payload_json->>'request_client_event_id' AS req_id
       FROM interview_events WHERE interview_id = $1 AND event_type IN ('ASSISTANT_QUERY','ASSISTANT_RESPONSE') ORDER BY seq`,
      [interviewId]
    );
    expect(events.rows.length).toBe(2);
    expect(events.rows[1].event_type).toBe("ASSISTANT_RESPONSE");
    expect(events.rows[1].req_id).toBe("assist-allow-1");
  });

  test("3) Idempotency: same client_event_id twice returns identical payload, no new events on second call", async () => {
    setGenerateAssistantResponseImpl(async () => ({ text: "First and only response." }));

    const app = createApp();
    const { interviewId, token } = await createInterviewWithToken(app);

    const first = await request(app)
      .post(`/api/talent/interviews/${interviewId}/assistant/query`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "idem-1", text: "What is bias-variance tradeoff?" });
    expect(first.status).toBe(200);
    const firstPayload = { blocked: first.body.blocked, text: first.body.text, category: first.body.category };

    const countAfterFirst = await pool.query(
      "SELECT COUNT(*) AS c FROM interview_events WHERE interview_id = $1 AND event_type IN ('ASSISTANT_QUERY','ASSISTANT_RESPONSE','ASSISTANT_RESPONSE_BLOCKED')",
      [interviewId]
    );

    const second = await request(app)
      .post(`/api/talent/interviews/${interviewId}/assistant/query`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "idem-1", text: "What is bias-variance tradeoff?" });
    expect(second.status).toBe(200);
    expect(second.body.blocked).toBe(firstPayload.blocked);
    expect(second.body.text).toBe(firstPayload.text);
    expect(second.body.category).toBe(firstPayload.category);

    const countAfterSecond = await pool.query(
      "SELECT COUNT(*) AS c FROM interview_events WHERE interview_id = $1 AND event_type IN ('ASSISTANT_QUERY','ASSISTANT_RESPONSE','ASSISTANT_RESPONSE_BLOCKED')",
      [interviewId]
    );
    expect(Number(countAfterSecond.rows[0].c)).toBe(Number(countAfterFirst.rows[0].c));
  });

  test("4) Postprocess: LLM returning code fences is sanitized / replaced", async () => {
    setGenerateAssistantResponseImpl(async () => ({
      text: "Here is how:\n```python\ndef foo():\n    return 42\n```\nThat should help."
    }));

    const app = createApp();
    const { interviewId, token } = await createInterviewWithToken(app);

    const res = await request(app)
      .post(`/api/talent/interviews/${interviewId}/assistant/query`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "postprocess-1", text: "Explain recursion briefly." });

    expect(res.status).toBe(200);
    expect(res.body.text).not.toContain("```");
    expect(res.body.text.length).toBeGreaterThan(0);
  });

  test("5) Assistant does not affect interviewer prompt engine", async () => {
    setGenerateAssistantResponseImpl(async () => ({ text: "Just a nudge." }));

    const app = createApp();
    const { interviewId, token } = await createInterviewWithToken(app);

    await request(app)
      .post(`/api/talent/interviews/${interviewId}/assistant/query`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "no-impact-1", text: "What does API mean?" });

    const snapshotRes = await request(app)
      .get(`/api/talent/interviews/${interviewId}/snapshot`)
      .set("X-Invite-Token", token);
    expect(snapshotRes.status).toBe(200);
    expect(snapshotRes.body.current_section?.id).toBe("section_1");
    expect(snapshotRes.body.current_prompt).toBeDefined();
    expect(snapshotRes.body.current_prompt.prompt_id).toBe("section_1_initial");

    await request(app)
      .post(`/api/talent/interviews/${interviewId}/section-done`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "done-after-assist" });
    const snapshot2 = await request(app)
      .get(`/api/talent/interviews/${interviewId}/snapshot`)
      .set("X-Invite-Token", token);
    expect(snapshot2.body.current_section?.id).toBe("section_2");
  });
});
