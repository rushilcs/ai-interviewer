# Deployment: Frontend (Vercel) + Backend (Render)

This guide walks you through deploying the AI Interviewer app with the **frontend on Vercel** and the **backend (Node + Postgres) on Render**, so you can share a live link with teammates.

---

## What gets deployed

| Component | Where | Notes |
|-----------|--------|------|
| **Frontend** (Next.js) | Vercel | Interview UI, Ops UI, invite links |
| **Backend** (Express API) | Render Web Service | Auth, interview flow, evaluation, coding API |
| **PostgreSQL** | Render Postgres | Interviews, invites, evaluation results |

**Coding Run/Submit:** The backend runs candidate code in **Docker** for isolation. Render’s standard Node environment does **not** include Docker. So in this setup, the coding section’s **Run** and **Submit** buttons will not execute code (they will error or time out). The rest of the app (sections 1–4, evaluation, replay, invites) works. To get Run/Submit working in production you’d need a backend host that supports Docker (e.g. a Docker-based Render service or another provider).

---

## Prerequisites

- **GitHub:** Repo pushed to GitHub (public or private; both Vercel and Render connect via GitHub).
- **Accounts:** [Vercel](https://vercel.com) and [Render](https://render.com) (free tiers are enough for a demo).
- **Backend env:** You’ll need a **JWT secret** and (optional) **OpenAI API key** for the assistant. No code changes required beyond what’s in this doc.

---

## Part 1: Render (Backend + Database)

### 1.1 Create a PostgreSQL database

1. In [Render Dashboard](https://dashboard.render.com), click **New +** → **PostgreSQL**.
2. Name it (e.g. `ai-interviewer-db`), choose region, then **Create Database**.
3. Wait until the DB is **Available**. Open it and copy the **Internal Database URL** (use this so the backend and DB stay on Render’s network). You’ll use it as `DATABASE_URL` for the Web Service.

### 1.2 Create the Backend Web Service

1. **New +** → **Web Service**.
2. Connect your **GitHub** account if needed, then select the **ai-interviewer** repo.
3. Configure:
   - **Name:** e.g. `ai-interviewer-api`
   - **Region:** Same as the database.
   - **Branch:** `main` (or your default).
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm run migrate && npm run start`. On the free tier, Pre-Deploy and Release Command are often unavailable; running migrations in the Start Command ensures the DB is migrated before the server starts. Migrations are idempotent (safe to run repeatedly).
4. **Instance type:** Free is fine for a demo.

### 1.3 Environment variables (Render Web Service)

In the Web Service → **Environment** tab, add:

| Key | Value | Required |
|-----|--------|----------|
| `DATABASE_URL` | *(Internal Database URL from 1.1)* | Yes |
| `JWT_SECRET` | A long random string (e.g. from `openssl rand -hex 32`) | Yes |
| `PORT` | `4000` (or leave unset; Render sets `PORT` automatically; the app uses `process.env.PORT`) | No (Render sets it) |
| `INVITE_BASE_URL` | Your **frontend** URL, e.g. `https://your-app.vercel.app` (no trailing slash) | Yes |
| `FRONTEND_ORIGIN` | Same as `INVITE_BASE_URL`, e.g. `https://your-app.vercel.app` (for CORS) | Yes |
| `OPS_ADMIN_EMAIL` | e.g. `ops-admin@example.com` | No (has default) |
| `OPS_ADMIN_PASSWORD` | Strong password for ops login | Yes (change from default) |
| `OPENAI_API_KEY` | Your OpenAI key (if you want the in-interview Assistant) | No |
| `OPENAI_MODEL` | e.g. `gpt-4o-mini` | No |

**Important:** Set `INVITE_BASE_URL` and `FRONTEND_ORIGIN` to the **exact** Vercel URL (e.g. `https://ai-interviewer-xxx.vercel.app`). You can add the Vercel URL after you deploy the frontend (step 2); then update these and redeploy the Web Service if needed.

### 1.4 Migrations and seed

**Migrations** are already covered if you set the Start Command to `npm run migrate && npm run start` (step 1.2). That runs migrations every time the service starts; re-running them is safe.

If you have access to **Release Command** (Settings → Build & Deploy), you can optionally use `npm run migrate` there instead and keep Start Command as `npm run start`. On the free tier, Pre-Deploy is locked and Release Command may not be available, so using the combined Start Command is the recommended approach.

**Seed the database** once (creates ops admin and roles):
   - Use **Render Shell** (Web Service → **Shell** tab), or run locally with `DATABASE_URL` set to the **external** connection string (if you need to run from your machine):
   ```bash
   cd backend
   npm install
   npm run migrate
   npm run seed
   ```
   If using Render Shell: `cd backend` (if needed), then `npm run seed` (migrations will have run when the service started). Ensure `DATABASE_URL`, `OPS_ADMIN_EMAIL`, and `OPS_ADMIN_PASSWORD` are set in the service so `seed` uses them.

3. After the first deploy, open the Web Service URL (e.g. `https://ai-interviewer-api.onrender.com`) and check:
   - `https://<your-backend>.onrender.com/health` → `{"ok":true}`.

---

## Part 2: Vercel (Frontend)

### 2.1 Import the project

1. Go to [Vercel](https://vercel.com) and **Add New** → **Project**.
2. Import the same **GitHub** repo (ai-interviewer).
3. Configure:
   - **Root Directory:** `frontend` (important).
   - **Framework Preset:** Next.js (should be auto-detected).
   - **Build Command:** `npm run build` (default).
   - **Output Directory:** default (`.next`).
   - **Install Command:** `npm install` (default).

### 2.2 Environment variables (Vercel)

In **Settings** → **Environment Variables** add:

| Key | Value | Environments |
|----|--------|---------------|
| `NEXT_PUBLIC_BACKEND_URL` | Your **Render backend** URL, e.g. `https://ai-interviewer-api.onrender.com` (no trailing slash) | Production, Preview (optional) |

**Important:** The frontend calls the backend from the browser, so the backend URL must be **publicly reachable** (Render’s default URL is fine). No `NEXT_PUBLIC_` prefix for backend-only vars.

### 2.3 Deploy

Click **Deploy**. When the build finishes, Vercel gives you a URL (e.g. `https://ai-interviewer-xxx.vercel.app`).

### 2.4 Wire backend to frontend URL

1. Copy the **Vercel URL** (production or the one you’ll share).
2. In **Render** → your Web Service → **Environment**:
   - Set `INVITE_BASE_URL` = `https://your-app.vercel.app`
   - Set `FRONTEND_ORIGIN` = `https://your-app.vercel.app`
3. Save and **redeploy** the Render service so CORS and invite links use the correct frontend URL.

---

## Part 3: Verify end-to-end

1. **Frontend:** Open `https://your-app.vercel.app`.
2. **Ops login:** Go to **Ops Login** (or `/ops/login`). Log in with `OPS_ADMIN_EMAIL` and `OPS_ADMIN_PASSWORD` from Render env. You should land on Ops → Interviews.
3. **Invite:** Create an invite (e.g. from Ops → Invites), copy the **invite URL** (it should point to your Vercel domain).
4. **Candidate:** Open the invite URL in another tab/incognito. Start the interview, answer a section, move on. No need to use coding Run/Submit for this check (they won’t work without Docker).
5. **Evaluation:** After completing the interview, in Ops open that interview and run **Run evaluation**. You should see evaluation results (and replay) without errors.

If any step fails, see **Troubleshooting** below.

---

## Summary checklist

- [ ] Render: Postgres created; Web Service created with **Root Directory** = `backend`.
- [ ] Render: Env vars set (`DATABASE_URL`, `JWT_SECRET`, `INVITE_BASE_URL`, `FRONTEND_ORIGIN`, `OPS_ADMIN_EMAIL`, `OPS_ADMIN_PASSWORD`; optional `OPENAI_*`).
- [ ] Render: Release command = `npm run migrate` (or equivalent).
- [ ] Render: Seed run once (Shell or local with prod `DATABASE_URL`).
- [ ] Vercel: Project imported with **Root Directory** = `frontend`.
- [ ] Vercel: `NEXT_PUBLIC_BACKEND_URL` = Render Web Service URL.
- [ ] Backend URL and frontend URL wired: `INVITE_BASE_URL` and `FRONTEND_ORIGIN` = Vercel URL; redeploy backend after setting them.

---

## Troubleshooting

- **CORS / “blocked by CORS”:** Ensure `FRONTEND_ORIGIN` on Render exactly matches the origin of the page (e.g. `https://your-app.vercel.app`). No trailing slash. Redeploy backend after changing.
- **Invite link goes to localhost:** Backend builds invite links from `INVITE_BASE_URL`. Set it to the Vercel URL and redeploy.
- **401 on API calls:** Frontend must send requests to the backend URL set in `NEXT_PUBLIC_BACKEND_URL`. Check Vercel env and rebuild/redeploy the frontend so the value is baked in.
- **Database connection errors:** Use the **Internal Database URL** from Render for `DATABASE_URL` so the Web Service and DB are on the same network. If you run migrations/seed from your machine, use the **external** URL and ensure your IP is allowed if the DB has network restrictions.
- **Coding Run/Submit fails:** Expected on Render’s standard Node runtime (no Docker). Other sections and evaluation work. For full coding execution, host the backend where Docker is available or use a Docker-based Render service.

---

## Optional: Preview / staging

- **Vercel:** For preview deployments, you can set `NEXT_PUBLIC_BACKEND_URL` for **Preview** to the same Render backend or a separate one. If you use one backend, add multiple origins to CORS: on Render set `FRONTEND_ORIGIN` to a comma-separated list, e.g. `https://yourapp.vercel.app,https://yourapp-git-xxx.vercel.app`.
- **Render:** Free tier may spin down the service after inactivity; first request after idle can be slow. Upgrade or use a paid instance if you need always-on response.

---

## Reference: env vars

**Backend (Render)**  
See table in **1.3**. Full list: `DATABASE_URL`, `JWT_SECRET`, `PORT` (optional), `INVITE_BASE_URL`, `FRONTEND_ORIGIN`, `OPS_ADMIN_EMAIL`, `OPS_ADMIN_PASSWORD`, `OPENAI_API_KEY`, `OPENAI_MODEL`.

**Frontend (Vercel)**  
`NEXT_PUBLIC_BACKEND_URL` = backend API base URL (no trailing slash).
