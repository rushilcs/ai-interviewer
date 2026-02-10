# Backend Data Models and APIs Spec (Design Only, No Code)
*(Contracts for persistence and communication across Talent UI, Orchestration Engine, Ops UI, and Evaluation.)*

## 0. Purpose
Define a minimal, deterministic backend that supports:
- Two-sided product (Ops + Talent)
- Interview orchestration via append-only event log
- Talent interview execution and reconnect/resume
- Evaluation job execution and storing results
- Ops review (replay + evidence + metrics)

This spec is design-only. It defines models, constraints, and API contracts.

---

## 1. Architecture Overview (MVP)
Systems:
- Auth + users (ops users only in MVP; candidates access via invite token)
- Role configuration (single role supported; still modeled cleanly)
- Interview instances (the thing candidates run)
- Append-only interview event log (source of truth)
- Code artifacts (stored as events + optional snapshot)
- Evaluation artifacts (signals, metrics, evidence pointers)

Data storage recommendation (MVP):
- Relational DB (Postgres)
- Optional object storage for large payloads (later; not required for MVP)

Transport:
- REST endpoints for actions and snapshots
- Optional server-sent events or WebSocket for live updates (polling acceptable MVP)

---

## 2. Core Identifiers and Versioning
- `id`: UUID for all primary objects
- `schema_version`: version of interview schema used (string, e.g., "mle-v1")
- `engine_version`: version of orchestration logic (string)
- `evaluation_version`: version of evaluation logic (string)

All persisted outputs must include versions for auditability.

---

## 3. Data Models (Conceptual)

## 3.1 Users
### `users`
- `id` (uuid, pk)
- `email` (unique)
- `password_hash` (ops only)
- `role` (enum: OPS_ADMIN, OPS_REVIEWER)
- `created_at`
- `updated_at`

Notes:
- Candidates do not need accounts in MVP.
- If you later add candidate accounts, keep separate table `candidates`.

---

## 3.2 Organizations (Optional MVP)
If you want multi-tenant from day 1:
### `orgs`
- `id`
- `name`
- `created_at`

### `org_members`
- `org_id`
- `user_id`
- `role` (OPS_ADMIN/OPS_REVIEWER)

If single-tenant MVP, you can omit and hardcode one org.

---

## 3.3 Role Definitions
### `roles`
- `id`
- `org_id` (nullable if single-tenant)
- `name` (e.g., "Machine Learning Engineer")
- `schema_version` (e.g., "mle-v1")
- `is_active` (bool)
- `created_at`
- `updated_at`

MVP: one role exists, but model supports more later.

---

## 3.4 Interview Templates (Optional)
If you separate schema versions from roles:
### `interview_templates`
- `id`
- `schema_version` (unique)
- `name`
- `schema_json` (or reference to file)
- `created_at`

MVP can store schema in code and only record `schema_version` in DB.

---

## 3.5 Interview Invites (Candidate Access)
### `interview_invites`
- `id`
- `role_id`
- `candidate_email` (nullable; optional)
- `token` (unique, high-entropy)
- `expires_at`
- `max_starts` (default 1)
- `starts_used` (default 0)
- `created_by_user_id` (ops)
- `created_at`
- `revoked_at` (nullable)

Notes:
- Candidate accesses interview via token link.
- Token must be treated like a password.

---

## 3.6 Interview Instances
### `interviews`
- `id`
- `org_id` (nullable if single-tenant)
- `role_id`
- `invite_id` (nullable; can create interview without invite later)
- `candidate_email` (nullable)
- `schema_version`
- `engine_version`
- `status` (enum: NOT_STARTED, IN_PROGRESS, PAUSED, COMPLETED, TERMINATED)
- `current_section_id` (string, from schema)
- `section_started_at` (timestamp, nullable)
- `section_deadline_at` (timestamp, nullable)
- `created_at`
- `started_at` (nullable)
- `completed_at` (nullable)
- `terminated_at` (nullable)
- `terminate_reason` (nullable string)

Invariants:
- Once `COMPLETED` or `TERMINATED`, status is immutable.
- `schema_version` is immutable after creation.
- Section transitions are derived from event log; these fields are denormalized for fast reads.

---

## 3.7 Interview Event Log (Source of Truth)
### `interview_events`
- `id` (uuid, pk)
- `interview_id` (fk)
- `seq` (bigint, monotonically increasing per interview, unique constraint on (interview_id, seq))
- `created_at` (timestamp)
- `actor_type` (enum: SYSTEM, INTERVIEWER_AI, ASSISTANT_AI, CANDIDATE, OPS_USER)
- `event_type` (string enum; see section 4)
- `client_event_id` (nullable; required for candidate-originated events for idempotency)
- `payload_json` (jsonb)
- `late` (bool default false)
- `section_id` (string; derived at write time from interview state)
- `schema_version`
- `engine_version`

Invariants:
- Append-only: never update or delete in normal operation.
- Determinism: engine state transitions must be explainable as a pure function of ordered events + schema.

---

## 3.8 Code Artifacts (Optional Snapshot)
MVP can store code as events only. If you want faster review:
### `interview_code_snapshots`
- `id`
- `interview_id`
- `section_id` (should be coding section id)
- `seq_at_capture` (event seq)
- `code_text`
- `created_at`

This is redundant but improves ops replay performance.

---

## 3.9 Evaluation Jobs
### `evaluation_jobs`
- `id`
- `interview_id` (unique if only one evaluation per interview; else allow multiple)
- `status` (enum: PENDING, RUNNING, COMPLETED, FAILED)
- `evaluation_version`
- `started_at` (nullable)
- `completed_at` (nullable)
- `error_message` (nullable)
- `created_at`

---

## 3.10 Evaluation Results (Structured Output)
### `evaluation_results`
- `id`
- `interview_id` (unique)
- `evaluation_version`
- `overall_score` (numeric, nullable if incomplete)
- `overall_band` (enum: STRONG_SIGNAL, MIXED_SIGNAL, WEAK_SIGNAL, nullable)
- `metrics_json` (jsonb)  # metric_name -> value + explanation + evidence pointers
- `section_results_json` (jsonb) # per section: metrics + summaries + evidence pointers
- `signals_json` (jsonb) # optional, detailed extracted signals
- `created_at`

Invariants:
- Must include evidence pointers for each metric (see 6.3).
- Must include `evaluation_version`.

---

## 4. Event Types (MVP Canonical)
Event types should be stable strings. Recommended set:

Lifecycle:
- `INTERVIEW_CREATED`
- `INTERVIEW_STARTED`
- `SECTION_STARTED`
- `PROMPT_PRESENTED`
- `SECTION_TIME_WARNING`
- `SECTION_ENDED`
- `INTERVIEW_COMPLETED`
- `INTERVIEW_TERMINATED`

Candidate:
- `CANDIDATE_MESSAGE`
- `CANDIDATE_MARKED_DONE`

Coding:
- `CANDIDATE_CODE_DRAFT_SAVED` (optional)
- `CANDIDATE_CODE_SUBMITTED`
- `CODE_TESTS_RUN` (optional)
- `CODE_TESTS_RESULT` (optional)

Assistant:
- `ASSISTANT_QUERY`
- `ASSISTANT_RESPONSE`
- `ASSISTANT_RESPONSE_BLOCKED` (if overstep detection)

System/Connection:
- `CLIENT_CONNECTED`
- `CLIENT_DISCONNECTED`
- `CLIENT_RECONNECTED`

Ops:
- `INVITE_CREATED`
- `INVITE_REVOKED`

Notes:
- `payload_json` structure must be documented per event type (see section 5).

---

## 5. Event Payload Schemas (Minimal)
Define only what is needed for deterministic replay and review.

### 5.1 `CANDIDATE_MESSAGE`
- `text` (string)
- `client_timestamp` (optional)

### 5.2 `PROMPT_PRESENTED`
- `prompt_id` (string)
- `prompt_text` (string)
- `section_id`

### 5.3 `SECTION_STARTED`
- `section_id`
- `section_name`
- `deadline_at`

### 5.4 `SECTION_ENDED`
- `section_id`
- `reason` (enum: time_expired, coverage_satisfied, candidate_done, system_error)

### 5.5 `CANDIDATE_CODE_SUBMITTED`
- `code_text` (string)
- `language` ("python")
- `submission_id` (string stable within interview)
- `client_timestamp` (optional)

### 5.6 `ASSISTANT_QUERY`
- `text` (string)

### 5.7 `ASSISTANT_RESPONSE`
- `text` (string)
- `category` (enum: concept, docs, nudge, error)
- `blocked` (bool default false)

---

## 6. API Contracts (REST, MVP)

## 6.1 Auth (Ops)
- `POST /api/auth/signup` (optional MVP)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Candidates do not auth; they use invite token.

---

## 6.2 Ops: Role + Invite Management
- `GET /api/roles`
- `POST /api/roles` (optional; MVP may seed one role)
- `POST /api/interview-invites`
  - body: `role_id`, `candidate_email` (optional), `expires_at` (optional)
  - returns: `invite_id`, `token`, `invite_url`
- `GET /api/interview-invites`
- `POST /api/interview-invites/{invite_id}/revoke`

---

## 6.3 Talent: Start + Snapshot
These endpoints are token-authenticated via invite token.

- `GET /api/talent/session?token=...`
  - validates token
  - returns:
    - `interview_id` (existing or newly created)
    - `schema_version`
    - `role_name`
    - section list (names + durations)
    - current status (NOT_STARTED typically)

- `POST /api/talent/interviews/{interview_id}/start`
  - auth: token
  - idempotent: if already started, return current snapshot
  - effect: create `INTERVIEW_STARTED` event and `SECTION_STARTED` for section 1
  - returns: snapshot (see 6.5)

---

## 6.4 Talent: Send Inputs (Idempotent)
All candidate-originated writes must include `client_event_id`.

- `POST /api/talent/interviews/{interview_id}/messages`
  - body: `client_event_id`, `text`
  - effect: append `CANDIDATE_MESSAGE` event
  - returns: ack + latest snapshot cursor

- `POST /api/talent/interviews/{interview_id}/section-done`
  - body: `client_event_id`
  - effect: append `CANDIDATE_MARKED_DONE` event

- `POST /api/talent/interviews/{interview_id}/code/submit`
  - body: `client_event_id`, `code_text`, `language`
  - effect: append `CANDIDATE_CODE_SUBMITTED` event

- `POST /api/talent/interviews/{interview_id}/assistant/query`
  - body: `client_event_id`, `text`
  - effect:
    - append `ASSISTANT_QUERY`
    - generate response
    - append `ASSISTANT_RESPONSE` (or blocked variant)
  - returns: assistant response (text + category)

---

## 6.5 Talent: Live Updates / Snapshot
Two acceptable MVP approaches:

### Option A: Polling (Simplest)
- `GET /api/talent/interviews/{interview_id}/snapshot?since_seq=N`
  - returns:
    - current interview status
    - current section id/name/goal
    - section_deadline_at
    - section progress list
    - allowed_input_modes
    - events since `N`
    - latest code starter prompt if in section 3
    - recommended UI warnings

### Option B: Streaming (Later)
- `GET /api/talent/interviews/{interview_id}/events/stream`

MVP can start with polling.

---

## 6.6 Ops: Review + Replay
Ops endpoints require ops auth.

- `GET /api/ops/interviews`
  - filters: status, role_id, date range

- `GET /api/ops/interviews/{interview_id}`
  - returns:
    - interview metadata
    - section outcomes
    - evaluation summary if available

- `GET /api/ops/interviews/{interview_id}/events`
  - returns full ordered event log (or paginated)

- `GET /api/ops/interviews/{interview_id}/replay`
  - returns pre-assembled replay bundle:
    - section-by-section transcript
    - code submissions timeline
    - assistant usage log
    - timing and disconnects

---

## 6.7 Evaluation APIs
- `POST /api/ops/interviews/{interview_id}/evaluate`
  - triggers evaluation job (idempotent)
- `GET /api/ops/interviews/{interview_id}/evaluation`
  - returns evaluation_results if available
- `GET /api/ops/evaluation-jobs/{job_id}`

---

## 7. Determinism and Idempotency Rules

### 7.1 Candidate Write Idempotency
- All candidate writes require `client_event_id`
- The server must enforce:
  - If `client_event_id` already seen for that interview, return prior ack and do not duplicate events

### 7.2 Event Sequencing
- `seq` is allocated server-side in strictly increasing order per interview
- All snapshots reference the highest committed `seq`

### 7.3 Auditability
- No destructive edits to events
- If redaction is needed later, it must be additive (e.g., a `REDACTION_APPLIED` event)

---

## 8. Security and Privacy (MVP)
- Invite tokens must be high entropy and treated as secrets
- Token must be checked on every talent endpoint
- Rate limit assistant queries (to avoid abuse)
- Store minimal candidate PII (email optional)
- Do not expose evaluation internals to candidates in MVP

---

## 9. Minimal Migration Plan (MVP)
1. Create roles (seed "Machine Learning Engineer", schema_version "mle-v1")
2. Ops creates invite -> returns token link
3. Candidate opens link -> `GET /talent/session` -> interview created if absent
4. Candidate starts -> `start` -> events begin
5. Candidate interacts -> events appended; orchestration engine reads events and emits interviewer prompts as events
6. Interview completes -> evaluation job can run -> results stored
7. Ops reviews via replay + evaluation results

---

## 10. Open Decisions (Choose Defaults Now)
These affect APIs and data model usage.

1) Single-tenant or multi-tenant org support in MVP
- Default recommended: single-tenant (simpler), keep org_id nullable

2) Polling vs streaming for talent live updates
- Default recommended: polling with `since_seq`

3) Store schema JSON in DB or in code only
- Default recommended: in code only, record schema_version in DB

4) Code tests execution in MVP
- Default recommended: simple test suite + store results as events (optional)

---

## 11. Deliverables Checklist
- Data model definitions and invariants
- Event types and payload schemas
- Talent endpoints (session/start/write/snapshot/assistant)
- Ops endpoints (invite/review/replay/evaluate)
- Determinism and idempotency rules