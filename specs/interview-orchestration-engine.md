# Interview Orchestration Engine Spec (Design Only, No Code)
*(Authoritative execution contract for `docs/interview-schema.md`.)*

## 0. Purpose
The Interview Orchestration Engine (IOE) is a deterministic state machine that:
- Executes the canonical interview schema
- Enforces time and sequencing
- Selects bounded follow-ups
- Records an auditable transcript of all events
- Produces structured artifacts for evaluation and review

This engine is the single point of truth for **what happens when** during an interview.

---

## 1. Scope (MVP)
### In scope
- Schema execution (sections, prompts, follow-ups, transitions)
- Timer enforcement and section cutoffs
- Bounded follow-up selection
- Interview memory (session-scoped)
- Audit log and event stream
- Recovery from refresh/reconnect (basic)

### Out of scope (MVP)
- Cross-interview personalization
- Proctoring/lockdown browser
- Advanced anti-cheat
- ATS integrations
- Multi-role schema routing (only 1 schema in MVP)

---

## 2. Inputs and Outputs

## 2.1 Inputs
### Static inputs
- `InterviewSchema` (from `docs/interview-schema.md`)
- `RoleConfig` (MVP: single role, minimal config)
- `InterviewInstanceConfig`
  - interview duration (fixed)
  - section durations (fixed)
  - follow-up caps (fixed)

### Runtime inputs
- Candidate messages (chat)
- Candidate code submissions (for coding section)
- Candidate AI assistant queries (separate channel)
- System events (timer ticks, disconnect/reconnect)
- Optional: explicit candidate actions (e.g., “I’m done”)

---

## 2.2 Outputs
- `InterviewEventLog` (append-only)
- `SectionArtifacts` (per section: raw + structured summaries)
- `EvaluationInputBundle` (for scoring/extraction system)
- `TalentUIState` stream (what UI should render at any moment)
- `OpsReplayBundle` (timeline + transcript + code history)

---

## 3. Core Data Model (Conceptual)

## 3.1 Interview Instance
An interview instance is uniquely identified and contains:
- `interview_id`
- `schema_version`
- `candidate_id` (or anonymous token)
- `status` (see state machine)
- `current_section_id`
- `section_start_time`, `section_deadline`
- `followup_budget_remaining` for current section
- `memory_state` (session-scoped)
- `event_cursor` (monotonic index into event log)

---

## 3.2 Event Log (Append-Only)
All actions are recorded as events with:
- `event_id` (monotonic)
- `timestamp`
- `actor` ∈ {system, interviewer_ai, assistant_ai, candidate}
- `type` (enumerated)
- `payload` (typed per event)

Key property: **the event log is the audit trail**. No event is overwritten.

### Required event types (MVP)
- `INTERVIEW_CREATED`
- `INTERVIEW_STARTED`
- `SECTION_STARTED`
- `PROMPT_PRESENTED`
- `CANDIDATE_MESSAGE`
- `FOLLOWUP_PRESENTED`
- `CANDIDATE_CODE_SUBMISSION`
- `ASSISTANT_QUERY`
- `ASSISTANT_RESPONSE`
- `SECTION_TIME_WARNING` (e.g., 2 min left)
- `SECTION_ENDED` (reason)
- `INTERVIEW_COMPLETED`
- `INTERVIEW_TERMINATED` (error/abandon)

---

## 3.3 Section Artifact (Per Section)
For each section, the engine produces:
- `raw_transcript` (messages, follow-ups, timestamps)
- `code_history` (only coding section)
- `bounded_context_summary` (structured memory for later sections)
- `coverage_flags` (which required dimensions were covered)
- `exit_reason` ∈ {time_expired, coverage_satisfied, candidate_done, system_error}

---

## 4. State Machine (Deterministic)

## 4.1 Top-Level States
- `NOT_STARTED`
- `IN_PROGRESS`
- `PAUSED` (temporary, e.g., disconnect; time policy defined below)
- `COMPLETED`
- `TERMINATED`

## 4.2 Section-Level Substates (within IN_PROGRESS)
For each section:
- `SECTION_INTRO` (display section goal + instructions)
- `SECTION_QUESTION_ACTIVE` (primary prompt presented; awaiting candidate)
- `SECTION_FOLLOWUP_ACTIVE` (bounded follow-up mode)
- `SECTION_WRAPUP` (capture summary + transition)

State transitions are governed by:
- Timer conditions
- Follow-up budget
- Exit conditions (schema-defined)
- Candidate explicit completion signal

---

## 5. Timing and Enforcement

## 5.1 Section Timers
Each section has:
- `section_duration`
- `section_deadline = section_start + duration`
- Optional `warning_thresholds` (e.g., T-2:00)

### Timekeeping invariant
- The engine’s timer is server-authoritative.
- UI clocks are derived from server deadlines.

---

## 5.2 Time Expiry Behavior
When a section deadline is reached:
- Engine emits `SECTION_ENDED(reason=time_expired)`
- Engine transitions to next section `SECTION_INTRO` immediately
- Candidate can finish typing, but messages after expiry are:
  - Either rejected OR captured as post-section notes (MVP choice below)

**MVP policy recommendation (simple + fair):**
- Accept late messages for up to **15 seconds grace**
- Mark them as `late=true` and attribute to previous section in audit log
- After grace, messages are accepted but attached to the **next** section

This avoids UX frustration while preserving fairness.

---

## 5.3 Pauses and Disconnects
### MVP policy (simple)
- If candidate disconnects:
  - Engine transitions to `PAUSED`
  - The timer continues running (fairness + determinism)
  - Candidate can reconnect and resume if time remains

### Optional enhancement (later)
- One-time pause allowance (e.g., 60 seconds) for technical issues

---

## 6. Follow-Up Selection Logic (Bounded)

## 6.1 Follow-Up Budget
Each section defines:
- `followup_cap` (max follow-ups)
- `followup_types_allowed` (from schema)

Engine maintains `followup_budget_remaining`.

---

## 6.2 Coverage Tracking
The schema defines **required dimensions** per section (e.g., metrics, constraints, failure modes).
Engine maintains a `coverage_flags` map:
- `dimension -> {not_covered, partially_covered, covered}`

Coverage is updated by an evaluator component (can be lightweight heuristic in MVP), but **the engine controls** whether to ask follow-ups.

---

## 6.3 Deterministic Follow-Up Selection
To remain bounded and auditable, follow-ups are selected from a finite pool:
- `followup_pool[section_id][dimension] -> list of questions`

Selection algorithm must be deterministic given the same inputs:
- Prefer uncovered required dimensions first
- Then deepen partially covered dimensions
- Stop when follow-up budget exhausted or coverage satisfied

### Tie-breaking (deterministic)
If multiple follow-ups qualify:
- Choose by fixed ordering:
  1) highest priority dimension
  2) first question in pool
  3) fallback: stable hash of `interview_id` to rotate variants (optional)

**MVP recommendation:**
- Use fixed ordering only (simplest, fully reproducible)

---

## 6.4 Exit Condition Evaluation
A section ends when any condition triggers:
- `time_expired`
- `coverage_satisfied` (all required dimensions covered OR minimum threshold met)
- `candidate_done` (explicit “I’m done” and minimum content collected)
- `system_error`

**Minimum content collected rule (fairness):**
- Candidate cannot instantly skip a section without providing minimal response.
- If candidate attempts skip early, the engine should prompt once:
  - “Please provide a brief outline so we can proceed.”

---

## 7. Memory Model (Session-Scoped)

## 7.1 Memory Layers
The engine maintains three memory layers:

1) **Raw Transcript Memory**
- Complete text/code log for audit and replay

2) **Structured Section Summaries**
- Short structured summary produced at end of each section
- Used to provide continuity between sections
- Stored as `SectionArtifacts[].bounded_context_summary`

3) **Interview Working State**
- Current section id, budgets, deadlines, coverage flags
- Deterministic and persisted

---

## 7.2 Memory Constraints (Non-Negotiable)
- Memory persists **only within the interview**
- No data from other candidates is used
- Summaries must not introduce facts not present in transcript

---

## 8. Candidate AI Assistant Channel (Bounded Assistance)

## 8.1 Separate Channels
The candidate’s assistant is a separate channel from the interviewer:
- Assistant queries/responses are logged
- Assistant cannot change section state
- Assistant cannot provide follow-ups
- Assistant cannot override timing

---

## 8.2 Assistant Output Constraints (Contract)
Assistant responses must follow:
- Allowed: definitions, docs-level clarifications, conceptual nudges
- Disallowed: full solutions, substantial code, step-by-step implementation plans

**Enforcement responsibility:**
- Assistant policy is part of assistant prompting + post-checking
- Engine logs violations and flags interview if assistant overstepped (later)

MVP: enforce via prompt rules + response length/code heuristics.

---

## 9. Talent UI State Contract

At any moment, the engine provides:
- `current_section`
- `section_goal_text`
- `time_remaining`
- `upcoming_sections` (names only)
- `allowed_actions` (chat, code, submit, ask assistant)

### Section transitions
The engine must emit an explicit transition event:
- `SECTION_ENDED`
- `SECTION_STARTED`
UI must display a clear boundary.

---

## 10. Error Handling and Recovery

## 10.1 Idempotency
Engine operations must be idempotent:
- Replaying the same candidate message should not duplicate state transitions
- A reconnect should not restart a section

Mechanism: use event ids and optimistic concurrency on `event_cursor`.

---

## 10.2 Partial Failure Modes
### If interviewer AI fails to respond
- Engine retries once
- If still fails, emits:
  - `INTERVIEW_TERMINATED(reason=system_error)`
  - and records error context

MVP: fail fast and preserve audit log.

---

## 11. Determinism Guarantees (Hard Requirements)

The engine must guarantee:
1) Same schema version + same inputs → same section order and follow-up selection
2) Follow-ups must come from predefined pools only
3) Timing rules apply uniformly
4) All events are logged in order with timestamps
5) State transitions are explainable in the audit trail

---

## 12. Open Configuration Points (MVP Defaults)
These are parameters ops may later configure. For MVP, set defaults:
- Total duration: 45 min
- Section durations: 10/15/15/5
- Follow-up caps: 3/4/2/1 (recommendation)
- Time warnings: T-2:00 and T-0:30 per section
- Late grace: 15 seconds

---

## 13. Test Plan (Design-Level)
The engine must be testable by simulating events.

### Required scenario tests
- Normal flow: completes all sections
- Candidate never responds: timeouts per section, completes interview
- Candidate responds late: grace behavior correct
- Candidate disconnects mid-section: PAUSED then resume, time continues
- Candidate tries to skip: minimum content enforcement
- Follow-up budget exhausted: section ends or transitions correctly
- Interviewer AI fails: termination preserves logs
- Deterministic follow-up selection: same transcript triggers same follow-ups

---

## 14. Implementation Notes (Non-Code)
- Represent the interview as a persisted state machine driven by events.
- Keep all AI invocations behind explicit “request/response” events for auditability.
- Do not intertwine UI logic with orchestration logic; UI subscribes to engine state.

---

## 15. Deliverables Produced by the Engine (MVP Checklist)
- [ ] Append-only event log
- [ ] Section artifacts with bounded summaries
- [ ] Deterministic follow-up selection
- [ ] Time enforcement with clear transitions
- [ ] Basic reconnect handling
- [ ] Export bundle for scoring and ops replay