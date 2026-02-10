# Talent Interview UI Spec (Design Only, No Code)
*(UI contract for executing `docs/interview-schema.md` via the Interview Orchestration Engine spec.)*

## 0. Purpose
The Talent Interview UI (TIUI) is a deterministic, section-based interface that:
- Transparently guides the candidate through a fixed interview sequence
- Renders current engine state (section, timer, instructions)
- Collects candidate inputs (chat, code submissions, assistant questions)
- Clearly communicates transitions and time boundaries
- Supports basic reconnect/resume without confusing state

The UI must feel professional, calm, and fair. It should reduce ambiguity and cognitive load.

---

## 1. Scope (MVP)

### In Scope
- Join/start flow from invite link
- Sectioned interview experience (progress + timer always visible)
- Chat-based responses for non-coding sections
- Embedded coding workspace for coding section
- Candidate AI assistant panel (bounded help)
- Time warnings and enforced transitions
- Basic reconnect/resume flow
- Autosave draft text and code (best-effort)

### Out of Scope (MVP)
- Webcam/mic proctoring
- Lockdown browser
- Rich media responses (audio/video)
- Collaboration
- Multi-language coding environments
- Mobile-first optimization (desktop-first acceptable)

---

## 2. High-Level UX Principles

1. **Always show where they are**
   - Section name
   - Section progress
   - Remaining time

2. **Minimize surprises**
   - Explicit section transitions
   - Clear time warnings
   - No hidden behavior

3. **Single primary action**
   - Answer, code, or submit — never multiple competing CTAs

4. **Fairness optics**
   - Same structure for everyone
   - Visible constraints and expectations

5. **Never lose work**
   - Autosave drafts
   - Warn before forced transitions

6. **Strict role separation**
   - Interviewer ≠ Assistant
   - Visually and conceptually distinct

---

## 3. Layout: Persistent Frame

All interview screens (except Join and Completion) share the same frame.

### 3.1 Header (Persistent)
- Left: Product logo or text (“MLE Technical Interview”)
- Center: Current section name (e.g. “Section 2: Modeling & Tradeoffs”)
- Right:
  - Countdown timer (server-authoritative)
  - Connection status indicator (Connected / Reconnecting / Disconnected)

---

### 3.2 Progress Rail (Persistent)

Visible at all times (top bar or left rail):

- Ordered list of sections
- Each section shows:
  - Name
  - Duration
  - Status: Completed / Current / Upcoming

Example:
✔ 1. Problem Framing (10m)
▶ 2. Modeling & Tradeoffs (15m)
○ 3. Coding Exercise (15m)
○ 4. Reflection (5m)


Rules:
- Current section is highlighted
- Upcoming sections show names only
- No skipping allowed via progress rail

---

### 3.3 Main Content Area (Changes by Section)

- Sections 1, 2, 4:
  - Instructions
  - Interviewer chat
  - Candidate text input

- Section 3:
  - Split view:
    - Code workspace
    - Instructions + interviewer chat

---

### 3.4 Right Drawer / Secondary Panel (Persistent)

**Candidate AI Assistant panel (collapsible)**

- Clearly labeled: **“Assistant (Help)”**
- Visible rules:
  - “Can clarify concepts; won’t write full solutions or substantial code”
- Conversation is **separate** from interviewer chat
- “Copy” allowed
- “Insert into editor” **not allowed** (MVP)

---

## 4. Screen Flow

### 4.1 Invite Link → Join Screen

Purpose: initialize session and set expectations.

Elements:
- Title: “Machine Learning Engineer Technical Interview”
- Description bullets:
  - Total duration: 45 minutes
  - Sectioned, structured interview
  - AI assistant available with limits
  - Focus on reasoning, not speed
- Lightweight system check:
  - Keyboard input
  - Network connectivity
  - Code editor loads
- Primary CTA: **Start Interview**
- Secondary CTA: **View Sections**

Behavior:
- No timer starts until Start Interview is clicked
- Invalid or expired link shows deterministic error state

---

### 4.2 Instructions Modal (Pre-Start)

Shown immediately after clicking Start.

Content:
- Sectioned structure overview
- Timing rules
- Assistant limitations
- Autosave reassurance

Controls:
- Optional acknowledgment checkbox
- CTA: **Begin Section 1**

---

### 4.3 Section Screens (1, 2, 4): Chat-First

Components:
- Section goal banner:
  - “In this section we evaluate: …”
- Pinned primary prompt (system message)
- Interviewer chat thread
- Candidate text input composer
- “I’m done with this section” button (disabled until minimal content)

Behavior:
- Drafts autosaved
- Follow-ups appear only when engine allows
- Input disabled after grace window once section ends

---

### 4.4 Section 3: Coding Workspace

Layout:
- Split view

Left pane:
- Python code editor
- Starter code scaffold
- Buttons:
  - Run tests (if enabled)
  - Submit
- Autosave indicator
- Optional reset-to-starter (with confirm)

Right pane:
- Task description (pinned)
- Interviewer chat
- Clarification messages

Submit rules:
- Submit creates a CODE_SUBMISSION event
- Multiple submissions allowed
- If time expires, latest draft may be auto-submitted and labeled

---

### 4.5 Section Transition Overlay

Displayed for ~3 seconds between sections.

Content:
- “Section X complete”
- “Next: Section Y (duration)”
- “What we’ll evaluate next: …”

Behavior:
- Auto-advance after countdown
- Optional “Continue now” button

---

### 4.6 Completion Screen

Content:
- “Interview Complete”
- Confirmation that responses were recorded
- Instruction to close tab
- Optional single-question feedback prompt

No scores or evaluation shown.

---

## 5. Timing UX Rules

### 5.1 Timer
- Shows remaining time for current section
- Derived from engine deadline
- UI clock never authoritative

### 5.2 Time Warnings
At thresholds (e.g. 2:00, 0:30):
- Non-intrusive toast
- Message: “2 minutes left in this section. Please wrap up.”

### 5.3 Time Expiry
- Banner: “Time’s up — moving to next section”
- Inputs disabled after grace window
- Late messages labeled if accepted

---

## 6. Minimal Content & Skip Prevention

Rules:
- “I’m done” disabled until minimal content threshold met
- If user attempts skip early:
  - Show message: “Please provide a brief outline before moving on.”

---

## 7. Reconnect / Resume UX

### 7.1 Connection Indicator
Header shows:
- Green: Connected
- Yellow: Reconnecting
- Red: Disconnected

### 7.2 Disconnect Behavior
- UI becomes read-only
- Banner: “Reconnecting… your timer continues”

### 7.3 Resume Behavior
On reconnect:
- Fetch engine snapshot
- Restore:
  - Section
  - Timer
  - Transcript
  - Drafts (best-effort)
- Toast: “Reconnected. You are in Section X.”

---

## 8. Assistant Panel (Bounded Help)

### 8.1 Visual Separation
- Distinct styling from interviewer chat
- Persistent label and rules reminder

### 8.2 Interaction Rules
- Available in all sections
- Copy allowed
- No direct code insertion

### 8.3 Disclosure
Footer text:
- “Assistant interactions are recorded for fairness and review.”

---

## 9. UI ↔ Engine Contract

### 9.1 UI Receives
- interview_id
- status
- current_section_id + name
- section_goal_text
- section_deadline
- section_progress_list
- allowed_input_modes
- transcript
- coding_prompt + starter_code (section 3)
- warnings

### 9.2 UI Sends
- START_INTERVIEW
- SEND_MESSAGE
- MARK_SECTION_DONE
- SAVE_CODE_DRAFT
- SUBMIT_CODE
- ASK_ASSISTANT

All outbound events include a stable client_event_id.

---

## 10. Interaction Rules by Section

| Section | Chat | Code | Assistant |
|------|------|------|-----------|
| 1 | Yes | No | Yes |
| 2 | Yes | No | Yes |
| 3 | Yes | Yes | Yes |
| 4 | Yes | No | Yes |

---

## 11. Accessibility (MVP)
- Keyboard-first navigation
- Clear focus states
- Adequate contrast
- Reduced motion
- Responsive for laptop screens

---

## 12. Edge Cases (Required)

1. Refresh → restore from engine snapshot  
2. Empty submit → block with error  
3. Timeout mid-typing → grace + label  
4. Editor fails → fallback textarea  
5. Skip attempt → enforce minimal content  
6. Engine termination → stable error screen  

---

## 13. MVP Defaults (Explicit)

- Transition overlay: auto-advance after 3s
- Late grace: 15s
- Coding auto-submit on timeout: enabled
- Assistant availability: all sections
- Skip threshold: ≥1 substantive message or submission

---

## 14. Deliverables Checklist

- Join/start screen
- Persistent progress + timer frame
- Chat-first sections
- Coding split-view
- Assistant panel with clear rules
- Transition overlays
- Reconnect handling
- Deterministic error states