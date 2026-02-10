import request from "supertest";
import { describe, expect, test } from "vitest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { seedAll } from "../src/db/seed";
import { pool } from "../src/db/pool";
import { prepareDatabase } from "./helpers";

async function getOpsToken(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: env.OPS_ADMIN_EMAIL, password: env.OPS_ADMIN_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function getRoleId(app: ReturnType<typeof createApp>, opsToken: string): Promise<string> {
  const res = await request(app)
    .get("/api/roles")
    .set("Authorization", `Bearer ${opsToken}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.roles)).toBe(true);
  expect(res.body.roles.length).toBeGreaterThanOrEqual(1);
  return res.body.roles[0].id;
}

describe("Chunk 2: Invites + Talent Session/Start + Events + Snapshot", () => {
  test("1) Invite create / list / revoke (ops auth required)", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const opsToken = await getOpsToken(app);
    const roleId = await getRoleId(app, opsToken);

    const createRes = await request(app)
      .post("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ role_id: roleId, candidate_email: "candidate@example.com" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.invite_id).toBeDefined();
    expect(createRes.body.token).toBeDefined();
    expect(typeof createRes.body.token).toBe("string");
    expect(createRes.body.invite_url).toContain("token=");

    const listRes = await request(app)
      .get("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.invites.some((i: { id: string }) => i.id === createRes.body.invite_id)).toBe(true);

    const revokeRes = await request(app)
      .post(`/api/interview-invites/${createRes.body.invite_id}/revoke`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(revokeRes.status).toBe(200);

    const listAfter = await request(app)
      .get("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`);
    const revoked = listAfter.body.invites.find((i: { id: string }) => i.id === createRes.body.invite_id);
    expect(revoked.revoked_at).toBeDefined();
  });

  test("2) Talent session creates interview + INTERVIEW_CREATED event", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const opsToken = await getOpsToken(app);
    const roleId = await getRoleId(app, opsToken);
    const inviteRes = await request(app)
      .post("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ role_id: roleId });
    expect(inviteRes.status).toBe(201);
    const token = inviteRes.body.token;

    const sessionRes = await request(app).get(`/api/talent/session?token=${token}`);
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.interview_id).toBeDefined();
    expect(sessionRes.body.schema_version).toBe("mle-v1");
    expect(sessionRes.body.role_name).toBe("Machine Learning Engineer");
    expect(sessionRes.body.status).toBe("NOT_STARTED");
    expect(Array.isArray(sessionRes.body.sections)).toBe(true);
    expect(sessionRes.body.sections.length).toBe(5);

    const interviewId = sessionRes.body.interview_id;
    const eventsRes = await pool.query(
      "SELECT event_type, seq FROM interview_events WHERE interview_id = $1 ORDER BY seq",
      [interviewId]
    );
    expect(eventsRes.rows.length).toBe(1);
    expect(eventsRes.rows[0].event_type).toBe("INTERVIEW_CREATED");
    expect(Number(eventsRes.rows[0].seq)).toBe(1);
  });

  test("3) Start creates INTERVIEW_STARTED + SECTION_STARTED, returns snapshot with section 1 + deadline", async () => {
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

    const startRes = await request(app)
      .post(`/api/talent/interviews/${interviewId}/start`)
      .set("X-Invite-Token", token);
    expect(startRes.status).toBe(200);
    expect(startRes.body.interview_id).toBe(interviewId);
    expect(startRes.body.status).toBe("IN_PROGRESS");
    expect(startRes.body.current_section).toBeDefined();
    expect(startRes.body.current_section.id).toBe("section_1");
    expect(startRes.body.current_section.deadline_at).toBeDefined();
    expect(startRes.body.current_section.remaining_seconds).toBeGreaterThan(0);
    expect(startRes.body.last_seq).toBeGreaterThanOrEqual(2);
    expect(startRes.body.sections.length).toBe(5);

    const eventsRes = await pool.query(
      "SELECT event_type, seq FROM interview_events WHERE interview_id = $1 ORDER BY seq",
      [interviewId]
    );
    const types = eventsRes.rows.map((r) => r.event_type);
    expect(types).toContain("INTERVIEW_STARTED");
    expect(types).toContain("SECTION_STARTED");
  });

  test("4) Candidate message idempotency (same client_event_id twice => only one event)", async () => {
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

    const clientEventId = "msg-idempotent-1";
    const first = await request(app)
      .post(`/api/talent/interviews/${interviewId}/messages`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: clientEventId, text: "Hello" });
    expect(first.status).toBe(200);
    const firstSeq = first.body.ack.server_seq;

    const second = await request(app)
      .post(`/api/talent/interviews/${interviewId}/messages`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: clientEventId, text: "Duplicate" });
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.ack.server_seq).toBe(firstSeq);

    const count = await pool.query(
      "SELECT COUNT(*) AS c FROM interview_events WHERE interview_id = $1 AND client_event_id = $2",
      [interviewId, clientEventId]
    );
    expect(Number(count.rows[0].c)).toBe(1);
  });

  test("5) Section done advances to next section deterministically (SECTION_ENDED + SECTION_STARTED)", async () => {
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

    const sectionDoneRes = await request(app)
      .post(`/api/talent/interviews/${interviewId}/section-done`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: "done-section-1" });
    expect(sectionDoneRes.status).toBe(200);
    expect(sectionDoneRes.body.current_section).toBeDefined();
    expect(sectionDoneRes.body.current_section.id).toBe("section_2");

    const eventsRes = await pool.query(
      "SELECT event_type, seq FROM interview_events WHERE interview_id = $1 ORDER BY seq",
      [interviewId]
    );
    const types = eventsRes.rows.map((r) => r.event_type);
    expect(types).toContain("CANDIDATE_MARKED_DONE");
    expect(types).toContain("SECTION_ENDED");
    const sectionStartedCount = eventsRes.rows.filter((r) => r.event_type === "SECTION_STARTED").length;
    expect(sectionStartedCount).toBe(2);
  });

  test("6) Time expiry: snapshot recommends expire_section; /advance emits SECTION_ENDED(time_expired)", async () => {
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

    const pastDeadline = new Date(Date.now() - 5000).toISOString();
    await pool.query(
      `UPDATE interview_events SET payload_json = jsonb_set(
        COALESCE(payload_json, '{}'), '{deadline_at}', to_jsonb($2::text)
      ) WHERE interview_id = $1 AND event_type = 'SECTION_STARTED' AND section_id = 'section_1'`,
      [interviewId, pastDeadline]
    );

    const snapshotRes = await request(app)
      .get(`/api/talent/interviews/${interviewId}/snapshot`)
      .set("X-Invite-Token", token);
    expect(snapshotRes.status).toBe(200);
    expect(snapshotRes.body.recommended_action).toBe("expire_section");

    const advanceRes = await request(app)
      .post(`/api/talent/interviews/${interviewId}/advance`)
      .set("X-Invite-Token", token);
    expect(advanceRes.status).toBe(200);
    expect(advanceRes.body.current_section).toBeDefined();
    expect(advanceRes.body.current_section.id).toBe("section_2");

    const sectionEnded = await pool.query(
      `SELECT payload_json->>'reason' AS reason FROM interview_events
       WHERE interview_id = $1 AND event_type = 'SECTION_ENDED' ORDER BY seq LIMIT 1`,
      [interviewId]
    );
    expect(sectionEnded.rows[0].reason).toBe("time_expired");
  });
});
