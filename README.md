# AI Interviewer

An ML mock interview app with a guided interview flow and a LeetCode-style coding section. **Ops** (interviewers) log in to create invites and review sessions; **candidates** use invite links to take the interview and complete coding problems.

---

## Prerequisites

- **Node.js** 18 or later  
- **PostgreSQL** (for the backend)  
- **Docker** (optional; required only if you want the coding section’s Run/Submit to execute code in a sandbox)

---

## Getting started

### 1. Database

Create a PostgreSQL database (e.g. `ai_interviewer`):

```bash
createdb ai_interviewer
```

(Or create it via your DB tool.)

### 2. Backend environment

From the repo root:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set at least:

- **`DATABASE_URL`** — your Postgres connection string (e.g. `postgresql://user:password@127.0.0.1:5432/ai_interviewer`)
- **`JWT_SECRET`** — a long random string for signing ops JWTs  
- **`OPS_ADMIN_EMAIL`** and **`OPS_ADMIN_PASSWORD`** — the ops admin account you’ll use to log in (e.g. `ops-admin@example.com` / `ops-admin-password`)

Optional:

- **`INVITE_BASE_URL`** — base URL for invite links (default `http://localhost:3000`)  
- **`OPENAI_API_KEY`** and **`OPENAI_MODEL`** — for the in-interview Assistant (concept questions only)

### 3. Migrate and seed

```bash
cd backend
npm install
npm run migrate
npm run seed
```

This applies DB migrations and creates the seeded ops admin user (and roles). You can run `npm run seed` again anytime to reset the ops admin password to match `.env`.

### 4. Start the backend

```bash
cd backend
npm run dev
```

Backend runs at **http://localhost:4000**.

### 5. Start the frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**.

### 6. (Optional) Coding runner

If you want **Run** and **Submit** in the coding section to execute code (in Docker):

```bash
cd services/runner
npm install
npm run build
```

Ensure Docker is installed and running. Without this, the coding UI still works but Run/Submit will fail.

---

## Data persistence

Interviews, users, invites, and evaluation results are stored in **PostgreSQL**. They persist across closing the app, restarting the backend or frontend, and rebooting your machine—as long as the database process is running and the data directory is intact. The app does not keep any of this data in memory; closing the application does not delete past interviews.

## Using the app

### Ops (interviewers)

1. Open **http://localhost:3000** and click **Ops Login** (or go to `/ops/login`).
2. Log in with the **OPS_ADMIN_EMAIL** and **OPS_ADMIN_PASSWORD** from `backend/.env`.
3. After login you’re on **Ops → Interviews**. Use **Invites** in the nav to create invite links.
4. On **Invites**: choose a role, optionally set candidate email, create an invite, then copy the **invite URL** and share it with the candidate.

### Candidates (interviewees)

1. Open the **invite URL** from Ops (e.g. `http://localhost:3000/interview?token=...`).
2. Start the interview when ready. You’ll go through timed sections (e.g. ML discussion, then Coding).
3. In the **Coding** section you can open the full coding environment, work on two problems, **Run** as often as you like, and **Submit** once per problem (after submit, that problem’s code is locked). When both are submitted (or you choose to move on), you can proceed to the next section.
4. You can use **Assistant** during the interview for concept-only questions (no solutions).

### After the interview

- Ops can open **Interviews**, select a session, and use **Review** / **Replay** and exports as needed.

---

## Project layout

| Path | Description |
|-----|-------------|
| `frontend/` | Next.js (App Router) + React + TypeScript + Tailwind — interview and coding UI |
| `backend/` | Express API — auth, talent interview flow, coding (problems, draft, run, submit) |
| `services/runner/` | Code runner used by the backend to execute submissions in Docker |
| `packages/shared/` | Shared types for the coding API |
| `docs/` | Interview schema and mock specs |

---

## Testing (backend)

Backend tests **reset the database** (DROP/CREATE public schema) before each run. To avoid wiping your **dev data** (interviews, users, invites):

1. In `backend/.env`, set **`TEST_DATABASE_URL`** (same user/host as `DATABASE_URL`, database name `ai_interviewer_test`). Example: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/ai_interviewer_test`
2. Create the test database once: `cd backend && npm run test:db:create`
3. Run tests: `cd backend && npm run test`

If you run tests **without** `TEST_DATABASE_URL`, the test run will **refuse** to reset the DB and will tell you to set it. If you previously ran tests without a test DB, that’s why dev interviews disappeared and you were logged out (the test run wiped the same DB the app uses).

---

## Environment reference (backend)

| Variable | Required | Description |
|---------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (used by the app) |
| `TEST_DATABASE_URL` | No | Separate DB for tests (recommended so tests don’t wipe dev data) |
| `JWT_SECRET` | Yes | Secret for signing ops JWTs |
| `OPS_ADMIN_EMAIL` | No | Ops admin email (default from `.env.example`) |
| `OPS_ADMIN_PASSWORD` | No | Ops admin password (default from `.env.example`) |
| `INVITE_BASE_URL` | No | Base URL for invite links (default `http://localhost:3000`) |
| `OPENAI_API_KEY` | No | For in-interview Assistant |
| `OPENAI_MODEL` | No | Model for Assistant (e.g. `gpt-4.1-mini`) |

---

## Coding section (reference)

- **Problems (seeded):** NDCG@K and Rerank with per-author cap (Python; Java/C++ stubbed).
- **Run** — runs public tests only; **Submit** — runs public + hidden tests. One submit per problem; code is locked after submit.
- **Rate limit:** 10 run+submit calls per minute per invite.
- Full coding API is documented in the code (e.g. `GET/PUT .../coding/draft`, `POST .../coding/run`, `POST .../coding/submit`).
