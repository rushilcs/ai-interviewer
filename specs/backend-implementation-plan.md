# Backend Implementation Plan (Cursor-Ready)
*(Design-first, then code. This is the execution checklist Cursor should follow.)*

## 0. Assumptions and Guardrails
- Single-tenant MVP (no org tables required). Keep `org_id` nullable in schemas if you want future-proofing.
- Candidates access via invite token (no candidate accounts in MVP).
- Postgres as the primary datastore.
- Polling for live updates using `since_seq`.
- Interview schema is stored in code; DB stores `schema_version` only.
- Append-only event log is the source of truth.
- Idempotency is mandatory for all candidate writes via `client_event_id`.

Files already created:
- `docs/constitution.md`
- `docs/interview-schema.md`
- `specs/interview-orchestration-engine.md`
- `specs/talent-interview-ui.md`
- `specs/candidate-ai-assistant.md`
- `specs/backend-apis.md`
- `specs/evaluation.md`

---

## 1. Repo Backend Structure (Recommended)
Create:
- `backend/`
  - `src/`
    - `config/`
    - `db/`
    - `models/`
    - `routes/`
      - `auth/`
      - `ops/`
      - `talent/`
    - `services/`
      - `orchestration/`
      - `assistant/`
      - `evaluation/`
    - `middlewares/`
    - `utils/`
  - `migrations/`
  - `tests/`

Cursor should implement backend in a way that keeps:
- routes thin
- services deterministic
- DB writes strictly append-only for events

---

## 2. Database Schema (Concrete Tables)
Implement as SQL migrations (or Prisma schema). Include constraints explicitly.

### 2.1 `users`
Columns:
- id uuid pk
- email text unique not null
- password_hash text not null
- role text not null check in ('OPS_ADMIN','OPS_REVIEWER')
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

Indexes:
- unique(email)

### 2.2 `roles`
Columns:
- id uuid pk
- name text not null
- schema_version text not null
- is_active boolean not null default true
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

Indexes:
- index(schema_version)

Seed:
- name = "Machine Learning Engineer"
- schema_version = "mle-v1"

### 2.3 `interview_invites`
Columns:
- id uuid pk
- role_id uuid not null fk roles(id)
- candidate_email text null
- token text unique not null
- expires_at timestamptz null
- max_starts int not null default 1
- starts_used int not null default 0
- created_by_user_id uuid not null fk users(id)
- created_at timestamptz not null default now()
- revoked_at timestamptz null

Constraints:
- starts_used <= max_starts

Indexes:
- unique(token)
- index(role_id)

### 2.4 `interviews`
Columns:
- id uuid pk
- role_id uuid not null fk roles(id)
- invite_id uuid null fk interview_invites(id)
- candidate_email text null
- schema_version text not null
- engine_version text not null
- status text not null check in ('NOT_STARTED','IN_PROGRESS','PAUSED','COMPLETED','TERMINATED')
- current_section_id text null
- section_started_at timestamptz null
- section_deadline_at timestamptz null
- created_at timestamptz not null default now()
- started_at timestamptz null
- completed_at timestamptz null
- terminated_at timestamptz null
- terminate_reason text null

Indexes:
- index(invite_id)
- index(status)
- index(role_id)

Invariants:
- schema_version immutable after creation (enforced in service layer)
- status terminal states immutable (enforced in service layer)

### 2.5 `interview_events`
Columns:
- id uuid pk
- interview_id uuid not null fk interviews(id)
- seq bigint not null
- created_at timestamptz not null default now()
- actor_type text not null check in ('SYSTEM','INTERVIEWER_AI','ASSISTANT_AI','CANDIDATE','OPS_USER')
- event_type text not null
- client_event_id text null
- payload_json jsonb not null default '{}'::jsonb
- late boolean not null default false
- section_id text null
- schema_version text not null
- engine_version text not null

Constraints:
- unique(interview_id, seq)
- unique(interview_id, client_event_id) where client_event_id is not null

Indexes:
- index(interview_id, seq)
- index(interview_id, event_type)
- index(interview_id, created_at)

### 2.6 `evaluation_jobs`
Columns:
- id uuid pk
- interview_id uuid not null fk interviews(id)
- status text not null check in ('PENDING','RUNNING','COMPLETED','FAILED')
- evaluation_version text not null
- started_at timestamptz null
- completed_at timestamptz null
- error_message text null
- created_at timestamptz not null default now()

Constraints:
- unique(interview_id) (MVP one job per interview)

Indexes:
- index(status)

### 2.7 `evaluation_results`
Columns:
- id uuid pk
- interview_id uuid not null fk interviews(id)
- evaluation_version text not null
- overall_score numeric null
- overall_band text null check in ('STRONG_SIGNAL','MIXED_SIGNAL','WEAK_SIGNAL')
- metrics_json jsonb not null default '{}'::jsonb
- section_results_json jsonb not null default '{}'::jsonb
- signals_json jsonb not null default '{}'::jsonb
- created_at timestamptz not null default now()

Constraints:
- unique(interview_id)

Indexes:
- index(evaluation_version)

---

## 3. Engine Service Responsibilities (Backend)
Even before “full orchestration,” implement the minimal engine loop so UI can function.

Create `services/orchestration/engine.ts` (or equivalent) that provides:

### 3.1 `appendEvent(interview_id, actor_type, event_type, client_event_id?, payload, section_id?, late?)`
- Allocates `seq` atomically (transaction):
  - seq = max(seq)+1 for interview
- Enforces idempotency:
  - if client_event_id exists for interview, return existing event
- Writes row into `interview_events` append-only

### 3.2 `computeInterviewState(interview_id)`
Pure function behavior (can be implemented as deterministic reducer):
- Reads schema by schema_version from code
- Replays events ordered by seq
- Outputs:
  - status
  - current_section_id
  - section_deadline_at
  - allowed_input_modes
  - progress list
  - any pending system actions (e.g., should emit SECTION_STARTED)

MVP: you may store denormalized fields in `interviews` after each write to avoid replay cost.

### 3.3 `maybeEmitSystemEvents(interview_id)`
After certain candidate events, engine may append:
- follow-ups
- time warnings
- section transitions
- completion

MVP shortcut:
- Only do deterministic section transitions on:
  - start
  - section_done
  - timer expiry check on snapshot calls (server side)

---

## 4. API Implementation Checklist (Concrete Endpoints)

## 4.1 Ops Auth
### POST /api/auth/login
Request:
- email
- password
Response:
- session cookie or JWT

### GET /api/auth/me
Response:
- id, email, role

(MVP: skip signup; seed first admin in DB.)

---

## 4.2 Ops: Roles
### GET /api/roles
Response:
- list of roles

(MVP: read-only; seeded.)

---

## 4.3 Ops: Invite Creation
### POST /api/interview-invites
Request:
- role_id
- candidate_email (optional)
- expires_at (optional)
Response:
- invite_id
- token
- invite_url

Behavior:
- token generated as high-entropy random string
- append `INVITE_CREATED` event (optional; can be DB-only MVP)

### POST /api/interview-invites/{invite_id}/revoke
Behavior:
- set revoked_at
- append `INVITE_REVOKED` event (optional)

---

## 4.4 Talent: Session Bootstrap
### GET /api/talent/session?token=...
Response:
- interview_id
- role_name
- schema_version
- status (likely NOT_STARTED)
- sections (name + duration)
- server_time

Behavior:
- validate invite token:
  - exists
  - not revoked
  - not expired
  - starts_used < max_starts
- create interview if not exists for invite_id (MVP: one interview per invite)
  - interviews.schema_version = roles.schema_version
  - interviews.engine_version = "engine-v1"
  - interviews.status = NOT_STARTED
  - append `INTERVIEW_CREATED` event

Idempotency:
- multiple GETs should return same interview_id

---

## 4.5 Talent: Start
### POST /api/talent/interviews/{interview_id}/start
Auth:
- token required (must match interview.invite_id)
Response:
- snapshot (see 4.8)

Behavior:
- if interview already started, return snapshot
- otherwise:
  - increment starts_used on invite (transaction)
  - set interviews.status = IN_PROGRESS, started_at = now
  - append `INTERVIEW_STARTED`
  - append `SECTION_STARTED` for section 1 with deadline_at
  - append `PROMPT_PRESENTED` with primary prompt text

---

## 4.6 Talent: Send Message
### POST /api/talent/interviews/{interview_id}/messages
Request:
- client_event_id (required)
- text
Response:
- ack: server_seq
- snapshot_cursor: latest seq

Behavior:
- append `CANDIDATE_MESSAGE`
- optionally: call `maybeEmitSystemEvents`

---

## 4.7 Talent: Mark Section Done
### POST /api/talent/interviews/{interview_id}/section-done
Request:
- client_event_id
Response:
- ack + snapshot_cursor

Behavior:
- append `CANDIDATE_MARKED_DONE`
- engine transitions deterministically:
  - append `SECTION_ENDED(reason=candidate_done)` if allowed
  - append next `SECTION_STARTED` + `PROMPT_PRESENTED`
  - if last section ended, append `INTERVIEW_COMPLETED` and set interviews.completed_at

---

## 4.8 Talent: Code Submit
### POST /api/talent/interviews/{interview_id}/code/submit
Request:
- client_event_id
- code_text
- language ("python")
Response:
- ack + snapshot_cursor

Behavior:
- append `CANDIDATE_CODE_SUBMITTED`
- optional: run tests and append `CODE_TESTS_RESULT`

---

## 4.9 Talent: Assistant Query
### POST /api/talent/interviews/{interview_id}/assistant/query
Request:
- client_event_id
- text
Response:
- text
- category
- blocked (boolean)

Behavior:
- append `ASSISTANT_QUERY`
- generate assistant response using candidate-ai-assistant spec
- if response violates constraints, append `ASSISTANT_RESPONSE_BLOCKED`
- else append `ASSISTANT_RESPONSE`

---

## 4.10 Talent: Snapshot Polling
### GET /api/talent/interviews/{interview_id}/snapshot?since_seq=N
Response:
- interview:
  - id, status, schema_version
  - current_section_id, section_name, section_goal_text
  - section_deadline_at
- progress_list
- allowed_input_modes
- events: ordered list of events with seq > N
- latest_seq

Behavior:
- On each snapshot call, the server may:
  - check timer expiry for current section
  - if expired, append `SECTION_ENDED(reason=time_expired)` and move to next section
  - this keeps timing server-authoritative without background jobs (MVP)

---

## 4.11 Ops: Review
### GET /api/ops/interviews
Response:
- interviews list (id, status, role, created_at, started_at, completed_at)

### GET /api/ops/interviews/{interview_id}/replay
Response:
- sections with:
  - prompts
  - candidate messages
  - follow-ups
  - code submissions
  - assistant logs
  - timing markers

Implementation:
- server assembles from event log deterministically

---

## 4.12 Ops: Evaluation
### POST /api/ops/interviews/{interview_id}/evaluate
Behavior:
- create evaluation_jobs row if not exists
- set status RUNNING
- run evaluation synchronously (MVP) or enqueue (later)
- write evaluation_results
- mark job COMPLETED

### GET /api/ops/interviews/{interview_id}/evaluation
Returns evaluation_results row.

---

## 5. Request/Response Examples (Minimal)
Cursor should include at least:
- talent session response example JSON
- snapshot response example JSON
- assistant query response example JSON
- ops replay response example JSON

These examples should match the spec fields exactly.

---

## 6. Minimal Orchestration Logic for MVP (What to Implement First)
To ship end-to-end quickly, implement orchestration in this order:

1) Start creates:
- SECTION_STARTED (section 1)
- PROMPT_PRESENTED

2) Section transitions only on:
- section_done requests
- snapshot timer expiry checks

3) Follow-ups:
- MVP: implement follow-ups as fixed pool questions based on coverage flags
- For now, you can skip dynamic coverage and ask exactly 2 follow-ups per section (deterministic)
- Store follow-ups as `FOLLOWUP_PRESENTED` events

4) Completion:
- After Section 4 ends, emit INTERVIEW_COMPLETED

This gives you a working interview flow without complex AI logic.

---

## 7. Determinism and Testing Plan (Backend)
Cursor must implement tests for:

- Idempotent candidate message writes (same client_event_id does not duplicate)
- Seq monotonicity and uniqueness
- Snapshot since_seq returns correct incremental events
- Section transitions deterministic given event log
- Token validation: revoked/expired/starts_used enforcement
- Terminal state immutability (COMPLETED/TERMINATED)

---

## 8. Cursor Prompt to Implement (Copy/Paste)
Use the following when starting implementation in Cursor.

Prompt:
"Implement the backend for the AI interviewer MVP in a deterministic, append-only event-sourced style using Postgres. Use the existing specs:
- docs/constitution.md
- docs/interview-schema.md
- specs/interview-orchestration-engine.md
- specs/backend-apis.md
- specs/candidate-ai-assistant.md
- specs/evaluation.md (saved as specs/evaluation.md)
Implement:
1) DB schema and migrations for users, roles, interview_invites, interviews, interview_events, evaluation_jobs, evaluation_results with constraints and indexes described.
2) REST endpoints: ops auth (login/me), roles list, invite create/revoke, talent session/start/messages/section-done/code-submit/assistant-query/snapshot, ops interviews list/replay, ops evaluate/get evaluation.
3) Deterministic seq allocation, append-only event log, idempotency via (interview_id, client_event_id) unique.
4) Snapshot polling with since_seq.
Do not implement frontend. Do not add extra features beyond the specs. Include tests for idempotency, sequencing, and token rules."

---

## 9. Save Location
Save this file as:
- `specs/backend-implementation-plan.md`