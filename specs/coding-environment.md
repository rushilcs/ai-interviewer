# PRD — Coding Environment (IDE + Runner) for Mock Interviews
Goal: Provide a LeetCode-style coding experience inside the interview app with multi-language support (Python/Java/C++), public test execution, hidden tests, safe sandboxing, and hard runtime limits.

## User Experience
- Left pane: Problem statement + constraints + examples + function signature(s) per language.
- Right pane: IDE editor (Monaco), language selector (Python/Java/C++), run button, submit button.
- Output panel:
  - “Run” executes only public tests; shows per-test pass/fail, expected vs actual (truncated), runtime, memory.
  - “Submit” executes public + hidden tests; shows summary only (e.g., 8/10) plus failing test index (no full hidden IO).
- Code persistence: autosave per (interview_id, problem_id, language) in DB; restore on refresh.
- Determinism: same code + inputs yields same outputs.

## Non-Goals
- No interactive problems (stdin streaming) for v1; only function-call style harness.
- No internet access in runner.
- No arbitrary file system writes beyond ephemeral sandbox.

## System Overview
Components:
1) Frontend (Next.js/React)
   - Monaco editor with language mode switching + templates/snippets.
   - Calls backend endpoints: /run and /submit.
2) API Backend (e.g., FastAPI/Node)
   - Auth, rate limit, request validation, job creation, result aggregation.
3) Runner Service (isolated execution)
   - Compiles/runs code in sandboxed containers.
   - Enforces time + memory limits; kills runaway jobs.
4) Storage (Postgres via Supabase or similar)
   - Stores interview attempts, code drafts, test definitions, run logs (optional), results.

## Data Model
Tables (minimal):
- problems: id, title, statement_md, constraints_md
- tests: id, problem_id, visibility(public|hidden), input_json, expected_json, tolerance(optional), timeout_ms(optional)
- attempts: id, user_id, interview_id, created_at
- code_drafts: attempt_id, problem_id, language, code_text, updated_at
- submissions: id, attempt_id, problem_id, language, code_text, mode(run|submit), status, started_at, finished_at, summary_json

## Execution Contract (Function Harness)
Each problem defines:
- function_name per language (e.g., ndcg_at_k)
- input schema (JSON) for each test
- expected output schema (JSON)
Runner generates a harness that:
- Deserializes JSON input
- Calls candidate function
- Serializes output to JSON
- Compares to expected:
  - Exact match for lists/ints/strings
  - Float compare with tolerance (absolute or relative) when configured

## API Endpoints
- POST /api/coding/run
  Body: {attempt_id, problem_id, language, code}
  Returns: {run_id, results:[{test_id, pass, actual, expected, runtime_ms, error}], summary:{passed, total}}
- POST /api/coding/submit
  Body: {attempt_id, problem_id, language, code}
  Returns: {submission_id, summary:{passed, total, status}}
- GET /api/coding/status?id=...
  Returns: status + summary (for async execution if needed)

## Runner Implementation (Safe + Bounded)
Sandboxing:
- Use Docker containers with:
  - no network (disable networking)
  - read-only base FS; writable /tmp only
  - CPU time limit (hard kill): default 2000ms per submission; per-test 500ms (configurable)
  - memory limit: 256MB
  - process limit (pids): small cap
- For Java/C++:
  - Compile step with its own timeout (e.g., 2s) and memory cap.
  - Cache compilation artifacts per run to avoid recompiling per test (within a single run only).
- For Python:
  - Run directly with per-test timeout.
Timeout strategy:
- Per-test timeout enforced (e.g., `timeout` in linux, or supervisor process).
- Whole-run timeout (e.g., 4s) as a safety net.
Output limits:
- Stdout/stderr capped (e.g., 64KB); truncate beyond.
- Actual/expected displayed truncated in UI.

## Correctness + Cheating Controls (v1)
- Hidden tests stored server-side only; not shipped to client.
- Runner disallows reflection-based access to test files by not mounting them separately; harness embeds inputs.
- No network access.
- Limit execution frequency per user (e.g., 10 runs/min) to prevent brute forcing hidden tests.

## Observability
- Store run logs: compile errors, runtime errors, timeouts, peak memory, per-test runtime.
- Dashboard metrics: success rates per problem, timeout rates, average runtime.

## Security
- Treat user code as untrusted:
  - container sandbox + no network + resource limits
  - randomize container names; clean up after execution
  - validate request sizes; cap code length (e.g., 50KB)
- Do not expose internal stack traces to client; return sanitized error messages.

## Rollout Plan
- Phase 1: synchronous run/submit (small scale), only public tests for run.
- Phase 2: async job queue (Redis/Sidekiq/BullMQ) if traffic grows; runner fleet scaling.
- Phase 3: add more languages and richer editor features (lint, formatting).