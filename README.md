# AI Interviewer

ML mock interview app with an interview flow and a LeetCode-style coding section.

## Getting started

### Prerequisites

- Node 18+
- Docker (required for the coding runner: sandboxed execution)
- PostgreSQL (for backend)

### Start services

1. **Backend** (from repo root):
   ```bash
   cd backend && npm install && npm run dev
   ```
   Backend runs at `http://localhost:4000`.

2. **Frontend** (from repo root):
   ```bash
   cd frontend && npm install && npm run dev
   ```
   Frontend runs at `http://localhost:3000`.

3. **Database**: run migrations and seed (see backend README or `backend/.env.example`).

### Coding environment

The coding section uses a **Docker-based runner** to execute untrusted code in a sandbox (no network, 256MB memory, per-test timeout 500ms). Ensure **Docker is installed and running** before using Run/Submit.

- **Runner** (build once): from repo root, `cd services/runner && npm install && npm run build`.
- The backend imports the runner and runs code in Docker when you call `POST /api/talent/interviews/:id/coding/run` or `.../submit`.

**Coding API (talent token required)**

- `GET /api/talent/interviews/:interview_id/coding/problems?token=...` — list problems (NDCG@K, Rerank with author cap).
- `GET /api/talent/interviews/:interview_id/coding/draft?problem_id=...&language=...&token=...` — get saved draft.
- `PUT /api/talent/interviews/:interview_id/coding/draft` — body `{ problem_id, language, code }` — autosave draft.
- `POST /api/talent/interviews/:interview_id/coding/run` — body `{ problem_id, language, code }` — run **public** tests only; returns per-test results (pass/fail, runtime, expected/actual truncated).
- `POST /api/talent/interviews/:interview_id/coding/submit` — same body — runs **public + hidden** tests; returns summary only (e.g. `Passed 8/10`, status).

**Example curl (run)**

Replace `INTERVIEW_ID` and `TOKEN` with a real interview id and talent invite token from your session.

```bash
curl -X POST "http://localhost:4000/api/talent/interviews/INTERVIEW_ID/coding/run?token=TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"problem_id":"ndcg_at_k","language":"python","code":"def ndcg_at_k(predicted_ids, relevance_map, k):\n    return 1.0"}'
```

Response shape: `{ run_id, results: [{ test_id, test_index, pass, actual, expected, runtime_ms, error, timed_out? }], summary: { passed, total }, compile_error? }`.

**Rate limit:** 10 runs (run + submit) per minute per invite.

## Project layout

- `frontend/` — Next.js (App Router) + React + TypeScript + Tailwind; interview and coding UI.
- `backend/` — Express API: auth, talent interview flow, coding routes (problems, draft, run, submit).
- `services/runner/` — Node runner: generates harness, runs code in Docker (Python supported; Java/C++ stubbed).
- `packages/shared/` — Shared types for coding (request/response, problem summary).
- `docs/interviews/mock-1.md` — Interview + coding section spec (problems, tests, signatures).

## Coding problems (seeded)

1. **NDCG@K** — `ndcg_at_k(predicted_ids, relevance_map, k)` → float; 5 public + 5 hidden tests; tolerance 1e-6.
2. **Rerank with per-author cap** — `rerank_with_author_cap(items, k, cap)` → list of item_ids; 5 public + 5 hidden tests; exact match.

UI route: `/interview/[id]/coding?token=...` (when in the Coding section, use “Open full coding environment” from the interview page).
