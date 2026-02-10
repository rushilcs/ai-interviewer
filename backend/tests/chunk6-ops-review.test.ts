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
  const res = await request(app).get("/api/roles").set("Authorization", `Bearer ${opsToken}`);
  expect(res.status).toBe(200);
  return res.body.roles[0].id;
}

async function completeInterviewAndEvaluate(app: ReturnType<typeof createApp>) {
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
      .send({
        client_event_id: `msg-s${i}-1`,
        text: `Section ${i} response: we consider metrics and constraints.`
      });
    await request(app)
      .post(`/api/talent/interviews/${interviewId}/section-done`)
      .set("X-Invite-Token", token)
      .send({ client_event_id: `done-s${i}` });
  }
  const evalRes = await request(app)
    .post(`/api/ops/interviews/${interviewId}/evaluate`)
    .set("Authorization", `Bearer ${opsToken}`);
  expect(evalRes.status).toBe(200);
  return { interviewId, opsToken };
}

describe("Chunk 6: Ops Review, Override, Export", () => {
  test("1) Review fetch returns evaluation + effective_band", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId, opsToken } = await completeInterviewAndEvaluate(app);

    const res = await request(app)
      .get(`/api/ops/interviews/${interviewId}/review`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(res.status).toBe(200);
    expect(res.body.interview_id).toBe(interviewId);
    expect(res.body.evaluation).toBeDefined();
    expect(res.body.evaluation.overall_band).toBeDefined();
    expect(res.body.effective_band).toBeDefined();
    expect(["STRONG_SIGNAL", "MIXED_SIGNAL", "WEAK_SIGNAL"]).toContain(res.body.effective_band);
    expect(res.body.override).toBeNull();
    expect(Array.isArray(res.body.comments)).toBe(true);
    expect(res.body.replay).toBeDefined();
    expect(res.body.replay.transcript_by_section).toBeDefined();
    expect(res.body.replay.assistant_usage).toBeDefined();
    expect(res.body.replay.timing_per_section).toBeDefined();
    expect(typeof res.body.replay.disconnects).toBe("number");
  });

  test("2) Override applies only to effective_band, not evaluation_results", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId, opsToken } = await completeInterviewAndEvaluate(app);

    const reviewBefore = await request(app)
      .get(`/api/ops/interviews/${interviewId}/review`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(reviewBefore.status).toBe(200);
    const originalBand = reviewBefore.body.evaluation.overall_band;

    const overrideRes = await request(app)
      .post(`/api/ops/interviews/${interviewId}/override`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({
        overridden_band: "STRONG_SIGNAL",
        justification: "A".repeat(50) + " - Reviewer override for strong performance."
      });
    expect(overrideRes.status).toBe(200);
    expect(overrideRes.body.effective_band).toBe("STRONG_SIGNAL");
    expect(overrideRes.body.override).not.toBeNull();
    expect(overrideRes.body.override.overridden_band).toBe("STRONG_SIGNAL");
    expect(overrideRes.body.evaluation.overall_band).toBe(originalBand);

    const evalRow = await pool.query(
      "SELECT overall_band FROM evaluation_results WHERE interview_id = $1",
      [interviewId]
    );
    expect(evalRow.rows[0].overall_band).toBe(originalBand);
  });

  test("3) Second override attempt is rejected", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId, opsToken } = await completeInterviewAndEvaluate(app);

    await request(app)
      .post(`/api/ops/interviews/${interviewId}/override`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({
        overridden_band: "MIXED_SIGNAL",
        justification: "First override with enough characters to pass validation."
      });
    const second = await request(app)
      .post(`/api/ops/interviews/${interviewId}/override`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({
        overridden_band: "WEAK_SIGNAL",
        justification: "Second override attempt that should be rejected by the server."
      });
    expect(second.status).toBe(409);
    expect(second.body.error || second.body.message || "").toMatch(/already exists|override/i);
  });

  test("4) Comments attach correctly to section/metric", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId, opsToken } = await completeInterviewAndEvaluate(app);

    await request(app)
      .post(`/api/ops/interviews/${interviewId}/comments`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ section_id: "section_1", comment: "Good problem framing." });
    await request(app)
      .post(`/api/ops/interviews/${interviewId}/comments`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ metric_name: "reasoning_quality", comment: "Solid reasoning throughout." });

    const review = await request(app)
      .get(`/api/ops/interviews/${interviewId}/review`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(review.status).toBe(200);
    expect(review.body.comments.length).toBe(2);
    const bySection = review.body.comments.find((c: { section_id: string }) => c.section_id === "section_1");
    const byMetric = review.body.comments.find((c: { metric_name: string }) => c.metric_name === "reasoning_quality");
    expect(bySection).toBeDefined();
    expect(bySection.comment).toBe("Good problem framing.");
    expect(byMetric).toBeDefined();
    expect(byMetric.comment).toBe("Solid reasoning throughout.");
  });

  test("5) Export endpoints return stable output", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId, opsToken } = await completeInterviewAndEvaluate(app);

    const json1 = await request(app)
      .get(`/api/ops/interviews/${interviewId}/export/json`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(json1.status).toBe(200);
    expect(json1.body.interview_id).toBe(interviewId);
    expect(json1.body.effective_band).toBeDefined();
    expect(Array.isArray(json1.body.metrics)).toBe(true);
    expect(Array.isArray(json1.body.sections)).toBe(true);

    const json2 = await request(app)
      .get(`/api/ops/interviews/${interviewId}/export/json`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(json2.status).toBe(200);
    expect(JSON.stringify(json2.body)).toBe(JSON.stringify(json1.body));

    const text1 = await request(app)
      .get(`/api/ops/interviews/${interviewId}/export/text`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(text1.status).toBe(200);
    expect(text1.text).toContain("Overall signal");
    expect(text1.text).toContain("Metric breakdown");
    expect(text1.text).toContain("Section summaries");

    const text2 = await request(app)
      .get(`/api/ops/interviews/${interviewId}/export/text`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(text2.status).toBe(200);
    expect(text2.text).toBe(text1.text);
  });

  test("6a) GET review returns 404 when no evaluation", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const opsToken = await getOpsToken(app);
    const roleId = await getRoleId(app, opsToken);
    const inviteRes = await request(app)
      .post("/api/interview-invites")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ role_id: roleId });
    const sessionRes = await request(app).get(
      `/api/talent/session?token=${inviteRes.body.token}`
    );
    const interviewId = sessionRes.body.interview_id;

    const res = await request(app)
      .get(`/api/ops/interviews/${interviewId}/review`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(res.status).toBe(404);
  });

  test("6b) Override rejects justification shorter than 50 chars", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId, opsToken } = await completeInterviewAndEvaluate(app);

    const res = await request(app)
      .post(`/api/ops/interviews/${interviewId}/override`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ overridden_band: "STRONG_SIGNAL", justification: "Too short." });
    expect(res.status).toBe(400);
  });

  test("7) Replay content matches Chunk 5 replay exactly", async () => {
    await prepareDatabase();
    await seedAll();
    const app = createApp();
    const { interviewId, opsToken } = await completeInterviewAndEvaluate(app);

    const replayRes = await request(app)
      .get(`/api/ops/interviews/${interviewId}/replay`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(replayRes.status).toBe(200);

    const reviewRes = await request(app)
      .get(`/api/ops/interviews/${interviewId}/review`)
      .set("Authorization", `Bearer ${opsToken}`);
    expect(reviewRes.status).toBe(200);

    const replay = replayRes.body;
    const reviewReplay = reviewRes.body.replay;

    expect(replay.interview_id).toBe(interviewId);
    expect(Array.isArray(replay.sections)).toBe(true);
    expect(Array.isArray(reviewReplay.transcript_by_section)).toBe(true);
    expect(replay.sections.length).toBe(reviewReplay.transcript_by_section.length);
    expect(replay.disconnect_count).toBe(reviewReplay.disconnects);
    expect(replay.assistant_usage.length).toBe(reviewReplay.assistant_usage.length);
    expect(replay.section_timing.length).toBe(reviewReplay.timing_per_section.length);

    for (let i = 0; i < replay.sections.length; i++) {
      expect(replay.sections[i].section_id).toBe(reviewReplay.transcript_by_section[i].section_id);
      expect(replay.sections[i].messages.length).toBe(
        reviewReplay.transcript_by_section[i].messages.length
      );
    }
  });
});
