# frontend/STYLE_CONTRACT.md

## 0) Goal
Build a clean, consistent, enterprise-style UI for “AI Interviewer” with zero “vibe-coded” styling. Use strict tokens, fixed typography, and reusable components. If something is unspecified, choose the simplest option that remains consistent with this contract.

## 1) Tech + constraints
- Next.js App Router + TypeScript + Tailwind.
- No component libraries (no shadcn, no Mantine). Build minimal primitives in /components/ui.
- Polling only (no websockets).
- Backend base URL: http://localhost:4000.
- Store ops JWT in localStorage.
- Invite token always comes from URL query (?token=...).

## 2) Color tokens (ONLY these)
Define as CSS variables in globals.css and map in tailwind.config.

### Core
- --bg: #0B0F14
- --surface: #0F1621
- --surface2: #111C2A
- --border: #223044
- --text: #E6EDF7
- --muted: #9DB0C8

### Accents / semantic
- --primary: #4F7DFF
- --success: #29D391
- --warning: #FFCC66
- --danger: #FF5C7A

### Alpha helpers (use rgba derived from above; no random colors)
- --overlay: rgba(11,15,20,0.72)

Rules:
- Do not introduce new hex colors.
- No gradients. No glassmorphism. No neon glows.

## 3) Typography
- Font: Inter (google font), fallback ui-sans-serif, system-ui.
- Allowed font sizes (Tailwind): text-xs (12), text-sm (14), text-base (16), text-lg (18) ONLY if needed, text-xl (20), text-2xl (24).
- Weights: 400, 500, 600 only.
- Line heights: headings 1.25, body 1.5.

Monospace:
- Use monospace ONLY for ids/seqs/tokens: ui-monospace, SFMono-Regular, Menlo, Monaco.

## 4) Spacing + layout
- 8px grid system. Use Tailwind spacing: 2,4,6,8,10,12.
- Page padding: p-6 desktop, p-4 mobile.
- Max width containers: max-w-[1100px].
- Cards:
  - radius: 12px
  - border: 1px solid var(--border)
  - background: var(--surface)
  - shadow: none (or a single subtle shadow token: shadow-[0_1px_0_rgba(0,0,0,0.3)]). Do NOT use multiple shadows.

## 5) Component primitives (must be reused everywhere)
Implement these in /components/ui:

### Button
- Height 36px (h-9)
- Radius 10px
- Variants:
  - primary: bg primary, text bg, hover: slightly brighter, focus ring
  - secondary: bg surface2 + border
  - ghost: transparent + hover surface2
  - danger: danger background
- Disabled: opacity 0.5, cursor-not-allowed
- No gradients

### Input / Textarea
- Input height: 40px (h-10)
- Radius 10px
- bg surface2
- border border
- focus ring: ring-2 ring-primary/40 and border-primary
- Placeholder uses muted

### Card
- base container: bg surface, border, rounded-xl
- Header slot: title + right-aligned actions

### Badge
- Small pill (rounded-full)
- Border 1px
- Status mapping:
  - NOT_STARTED: muted
  - IN_PROGRESS: primary
  - COMPLETED: success
  - TERMINATED: danger
  - PAUSED: warning
- Always uppercase label

### Table
- No zebra rows.
- Row separators: border-b border
- Header: sticky (top-0), bg surface, text muted, small
- Cells: compact, readable
- First column often monospace (ids)

### Panel
- A bordered box for sub-sections inside a page.
- Used for Transcript, Assistant, Evaluation.

### Toast (optional but consistent)
- Minimal, top-right, 1–2 lines, no animations beyond fade.

## 6) Motion rules
- Default: no animation.
- Allowed: transition-opacity and transition-colors at 150ms only.

## 7) Formatting rules
- IDs displayed truncated: first 8 + ellipsis + last 4 (e.g., 9df06d5f…ba9c) with copy button.
- Times shown in local time format: `Feb 9, 1:13 PM` (use Intl.DateTimeFormat).
- Error banners: red border + red text on surface2.
- Loading states: show skeleton or “Loading…” in muted text; no spinners required.

## 8) Page layouts (must match)
### 8.1 /ops/login
Layout:
- Centered card (max-w-md)
- Title: “Ops Login”
- Inputs: Email, Password
- Submit button full width
Behavior:
- POST /api/auth/login
- Save token to localStorage key: `ops_jwt`
- Redirect to /ops/interviews
Errors:
- Render error banner inside card.

### 8.2 /ops/interviews
Layout:
- AppShell top bar:
  - Left: “AI Interviewer”
  - Right: “Logout”
- Page header row:
  - Left: “Interviews”
  - Right: Refresh button
- Main: Table columns:
  - Interview ID (mono + copy)
  - Role
  - Status badge
  - Started
  - Completed
  - View action (button)
Behavior:
- GET /api/ops/interviews with Bearer JWT
- Clicking row or View goes to /ops/interviews/[id]
- 401 -> redirect /ops/login (clear jwt)

### 8.3 /ops/interviews/[id]
Layout:
- Top: back link to interviews
- Header: Interview <id-truncated> + status badge + Refresh + Run evaluation button
- Two columns desktop:
  - Left (w-[420px]):
    - Evaluation panel
  - Right:
    - Replay panel (grouped by section)
Behavior:
- GET /api/ops/interviews/:id/replay
- GET /api/ops/interviews/:id/evaluation
- POST /api/ops/interviews/:id/evaluate
Errors: show banner within panel; do not crash page.

### 8.4 /interview?token=...
Layout:
- Center card (max-w-xl)
- Title: “Interview Session”
- Shows role name, schema version, sections list with durations
- If NOT_STARTED: Start button
Behavior:
- GET /api/talent/session?token=...
- Start: POST /api/talent/interviews/:id/start?token=...
- Redirect to /interview/[id]?token=...

### 8.5 /interview/[id]?token=...
Layout:
- Top bar:
  - Left: “Interview”
  - Right: token status indicator (Valid / Invalid)
- Two columns desktop:
  - Left (w-[360px], stack):
    1) Section card: name + remaining time pill
    2) Prompt card: current_prompt text (if null show “No prompt”)
    3) Action buttons:
       - Mark done
       - Advance (only if recommended_action === "expire_section")
  - Right:
    1) Transcript panel (scrollable)
    2) Composer panel:
       - Message textarea + Send
    3) Assistant panel:
       - Input + Ask
       - Show last assistant response + blocked flag
Behavior:
- Poll snapshot every 1500ms:
  - GET /api/talent/interviews/:id/snapshot?since_seq=N&token=...
- Maintain local transcript state:
  - Keep `lastSeq` and append new events into an array (dedupe by seq).
- Send message:
  - POST /messages?token=...
- Mark done:
  - POST /section-done?token=...
- Advance:
  - POST /advance?token=...
- Assistant:
  - POST /assistant/query?token=...
Errors:
- Invalid token -> show full-screen “Invalid or expired token” card.
- Network errors -> show banner but keep rendering cached transcript.

## 9) Event rendering mapping (talent transcript)
Render events in a timeline list:
- PROMPT_PRESENTED: “Interviewer” message bubble (left)
- CANDIDATE_MESSAGE: “You” bubble (right)
- ASSISTANT_QUERY/ASSISTANT_RESPONSE*: assistant panel history only (not main transcript) OR render with “Assistant”
- SECTION_STARTED/ENDED: small divider row with section name + reason
- INTERVIEW_*: divider row

## 10) Data access + auth rules
- ops:
  - jwt from localStorage ops_jwt
  - fetch wrapper adds Authorization header
- talent:
  - token from search params
  - fetch wrapper appends `?token=...` (or preserves existing query)
- Never log tokens in console.