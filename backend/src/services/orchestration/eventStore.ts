import type { PoolClient } from "pg";
import { pool } from "../../db/pool";
import { loadSchema } from "./schema";
import { reduceInterviewState, type InterviewEvent } from "./state";

const ENGINE_VERSION = "engine-v1";

export type ActorType = "SYSTEM" | "INTERVIEWER_AI" | "ASSISTANT_AI" | "CANDIDATE" | "OPS_USER";

export type AppendResult = {
  seq: number;
  id: string;
  created_at: string;
  duplicate: boolean;
};

/**
 * Get events for an interview, optionally after a given seq. Ordered by seq.
 */
export async function getEvents(
  interviewId: string,
  sinceSeq?: number
): Promise<{ seq: number; event_type: string; payload: Record<string, unknown>; created_at: string; section_id: string | null }[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      SELECT seq, event_type, payload_json, created_at, section_id
      FROM interview_events
      WHERE interview_id = $1 AND ($2::bigint IS NULL OR seq > $2)
      ORDER BY seq ASC
      `,
      [interviewId, sinceSeq ?? null]
    );
    return result.rows.map((r) => ({
      seq: Number(r.seq),
      event_type: r.event_type,
      payload: (r.payload_json as Record<string, unknown>) ?? {},
      created_at: new Date(r.created_at).toISOString(),
      section_id: r.section_id
    }));
  } finally {
    client.release();
  }
}

/**
 * Get events and reduce to state. Uses schema_version from interviews table.
 */
export async function getEventsAndState(interviewId: string): Promise<{
  events: InterviewEvent[];
  state: ReturnType<typeof reduceInterviewState>;
  schema_version: string;
}> {
  const client = await pool.connect();
  try {
    const invRow = await client.query<{ schema_version: string }>(
      "SELECT schema_version FROM interviews WHERE id = $1",
      [interviewId]
    );
    if (invRow.rowCount !== 1) {
      throw new Error("Interview not found");
    }
    const schema_version = invRow.rows[0].schema_version;
    const schema = loadSchema(schema_version);
    const rows = await client.query(
      `SELECT seq, event_type, payload_json, created_at, section_id
       FROM interview_events WHERE interview_id = $1 ORDER BY seq ASC`,
      [interviewId]
    );
    const events: InterviewEvent[] = rows.rows.map((r) => ({
      seq: Number(r.seq),
      event_type: r.event_type,
      payload: (r.payload_json as Record<string, unknown>) ?? {},
      created_at: new Date(r.created_at).toISOString(),
      section_id: r.section_id
    }));
    const state = reduceInterviewState(schema, events);
    return { events, state, schema_version };
  } finally {
    client.release();
  }
}

/**
 * Append one event. Idempotent when client_event_id is set: if that client_event_id
 * already exists for this interview, returns the existing event (duplicate: true).
 * Allocates seq in a transaction (lock interviews row, max(seq)+1).
 */
export async function appendEvent(
  interviewId: string,
  actorType: ActorType,
  eventType: string,
  payload: Record<string, unknown>,
  clientEventId?: string | null
): Promise<AppendResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invRow = await client.query<{ schema_version: string; engine_version: string }>(
      "SELECT schema_version, engine_version FROM interviews WHERE id = $1 FOR UPDATE",
      [interviewId]
    );
    if (invRow.rowCount !== 1) {
      await client.query("ROLLBACK");
      throw new Error("Interview not found");
    }
    const schema_version = invRow.rows[0].schema_version;
    const engine_version = invRow.rows[0].engine_version ?? ENGINE_VERSION;

    if (clientEventId != null && clientEventId !== "") {
      const existing = await client.query<{ seq: string; id: string; created_at: Date }>(
        `SELECT seq, id, created_at FROM interview_events
         WHERE interview_id = $1 AND client_event_id = $2`,
        [interviewId, clientEventId]
      );
      if (existing.rowCount !== null && existing.rowCount > 0) {
        const row = existing.rows[0];
        await client.query("COMMIT");
        return {
          seq: Number(row.seq),
          id: row.id,
          created_at: new Date(row.created_at).toISOString(),
          duplicate: true
        };
      }
    }

    const maxSeq = await client.query<{ max_seq: string | null }>(
      "SELECT MAX(seq) AS max_seq FROM interview_events WHERE interview_id = $1",
      [interviewId]
    );
    const nextSeq = (maxSeq.rows[0]?.max_seq == null ? 0 : Number(maxSeq.rows[0].max_seq)) + 1;

    const payloadJson = JSON.stringify(payload ?? {});

    const schema = loadSchema(schema_version);
    const existingEvents = await client.query(
      `SELECT seq, event_type, payload_json, created_at, section_id
       FROM interview_events WHERE interview_id = $1 ORDER BY seq ASC`,
      [interviewId]
    );
    const interviewEvents: InterviewEvent[] = existingEvents.rows.map((r) => ({
      seq: Number(r.seq),
      event_type: r.event_type,
      payload: (r.payload_json as Record<string, unknown>) ?? {},
      created_at: new Date(r.created_at).toISOString(),
      section_id: r.section_id
    }));
    const state = reduceInterviewState(schema, interviewEvents);
    const section_id = state.current_section_id;

    const insertResult = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO interview_events (
        interview_id, seq, actor_type, event_type, client_event_id,
        payload_json, section_id, schema_version, engine_version
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      RETURNING id, created_at`,
      [
        interviewId,
        nextSeq,
        actorType,
        eventType,
        clientEventId ?? null,
        payloadJson,
        section_id,
        schema_version,
        engine_version
      ]
    );
    const row = insertResult.rows[0];
    await client.query("COMMIT");
    return {
      seq: nextSeq,
      id: row.id,
      created_at: new Date(row.created_at).toISOString(),
      duplicate: false
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Insert one event using an existing transaction client. Caller must hold interview row lock and manage transaction.
 * Used for start flow to append INTERVIEW_STARTED + SECTION_STARTED atomically with invite update.
 */
export async function insertEventInTx(
  client: PoolClient,
  interviewId: string,
  seq: number,
  actorType: ActorType,
  eventType: string,
  payload: Record<string, unknown>,
  options: { section_id?: string | null; schema_version: string; engine_version?: string }
): Promise<{ id: string; created_at: string }> {
  const schema_version = options.schema_version;
  const engine_version = options.engine_version ?? ENGINE_VERSION;
  const section_id = options.section_id ?? null;
  const payloadJson = JSON.stringify(payload ?? {});
  const result = await client.query<{ id: string; created_at: Date }>(
    `INSERT INTO interview_events (
      interview_id, seq, actor_type, event_type, client_event_id,
      payload_json, section_id, schema_version, engine_version
    ) VALUES ($1, $2, $3, $4, NULL, $5::jsonb, $6, $7, $8)
    RETURNING id, created_at`,
    [interviewId, seq, actorType, eventType, payloadJson, section_id, schema_version, engine_version]
  );
  const row = result.rows[0];
  return { id: row.id, created_at: new Date(row.created_at).toISOString() };
}

/**
 * Get the assistant response already recorded for a given client_event_id (idempotency).
 * Finds ASSISTANT_QUERY with that client_event_id, then the next ASSISTANT_RESPONSE or ASSISTANT_RESPONSE_BLOCKED.
 */
export async function getAssistantResponseForClientEvent(
  interviewId: string,
  clientEventId: string
): Promise<{
  blocked: boolean;
  reason?: string;
  text: string;
  category: string;
} | null> {
  const result = await pool.query(
    `SELECT seq, event_type, payload_json, client_event_id
     FROM interview_events WHERE interview_id = $1 ORDER BY seq ASC`,
    [interviewId]
  );
  type Row = { seq: string; event_type: string; payload_json: Record<string, unknown>; client_event_id: string | null };
  const rows = result.rows as Row[];
  const queryRowIdx = rows.findIndex(
    (r) => r.event_type === "ASSISTANT_QUERY" && r.client_event_id === clientEventId
  );
  if (queryRowIdx < 0) return null;
  const querySeq = Number(rows[queryRowIdx].seq);
  const responseRow = rows.find(
    (r) =>
      (r.event_type === "ASSISTANT_RESPONSE" || r.event_type === "ASSISTANT_RESPONSE_BLOCKED") &&
      Number(r.seq) > querySeq &&
      ((r.payload_json?.request_client_event_id as string) === clientEventId || Number(r.seq) === querySeq + 1)
  );
  if (!responseRow) return null;
  const payload = (responseRow.payload_json ?? {}) as Record<string, unknown>;
  const blocked = responseRow.event_type === "ASSISTANT_RESPONSE_BLOCKED" || payload.blocked === true;
  const text = (payload.safe_alternative_text as string) ?? (payload.text as string) ?? "";
  const category = (payload.category as string) ?? "nudge";
  const reason = payload.reason as string | undefined;
  return { blocked, text, category, ...(reason && { reason }) };
}

/**
 * Update interview denormalized fields (status, current_section_id, section_started_at, section_deadline_at, started_at, completed_at).
 * Call after appending events if you want the interviews row to reflect current state.
 */
export async function updateInterviewDenormalized(
  interviewId: string,
  state: {
    status: string;
    current_section_id: string | null;
    section_started_at: string | null;
    section_deadline_at: string | null;
    started_at?: string | null;
    completed_at?: string | null;
  }
): Promise<void> {
  await pool.query(
    `UPDATE interviews SET
      status = $2, current_section_id = $3, section_started_at = $4, section_deadline_at = $5,
      started_at = COALESCE(interviews.started_at, $6::timestamptz),
      completed_at = COALESCE(interviews.completed_at, $7::timestamptz)
    WHERE id = $1`,
    [
      interviewId,
      state.status,
      state.current_section_id,
      state.section_started_at,
      state.section_deadline_at,
      state.started_at ?? null,
      state.completed_at ?? null
    ]
  );
}
