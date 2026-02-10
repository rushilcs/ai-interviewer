# Product & System Constitution
*(Immutable. This document governs all design and implementation decisions.)*

## 1. Product Mission
Build a **fair, deterministic, AI-guided technical interview platform** for Machine Learning Engineer roles that prioritizes **reasoning, design quality, and evidence**, while producing **quantitative metrics to assist (not replace) human hiring decisions**.

The system replaces the **interviewer**, not the **interview**.

---

## 2. Core Principles (Non-Negotiable)

### 2.1 Determinism & Fairness
- All candidates experience the **same interview structure**
- Interview flow is **predefined and bounded**
- Follow-up questions are **selected from an allowed set**
- The AI must never invent entirely new evaluation paths

The system must be **auditable, reproducible, and defensible**.

---

### 2.2 Sequenced, Transparent Interview
- The interview is divided into **explicit sections**
- Candidates always know:
  - Which section they are in
  - What is being evaluated
  - What sections remain
- Time is fixed and enforced per section

The AI **guides**, it does not simulate a human personality.

---

### 2.3 Evidence-First Evaluation
- Human reviewers make final decisions
- The system provides:
  - Structured evidence
  - Extracted signals
  - Quantitative metrics
- No single score determines pass/fail

Metrics support judgment; they do not replace it.

---

### 2.4 Reasoning > Correctness
- Thought process, strategy, and tradeoffs are more important than final answers
- Partial solutions with strong reasoning are valued
- The system must actively probe **why**, not just **what**

---

### 2.5 Mixed-Mode Assessment (Discussion + Coding)
- Interviews include:
  - Conceptual discussion
  - System/design reasoning
  - Coding exercises
- Not all sections require code
- Coding is evaluated for:
  - Correctness
  - Clarity
  - Approach

---

### 2.6 Allowed Candidate Assistance
- Candidates may access an **AI assistant** during the interview
- The assistant may:
  - Explain concepts
  - Clarify documentation-level details
  - Nudge reasoning
- The assistant must NOT:
  - Provide full solutions
  - Write substantial blocks of code
  - Give step-by-step implementations

The goal is realism, not artificial restriction.

---

### 2.7 Scoped Memory
- The AI maintains **deep memory within a single interview**
- No memory persists across interviews
- No personalization based on prior candidates

---

## 3. Explicit Non-Goals (MVP)

The following are intentionally out of scope:

- Fully generative, open-ended interviews
- Adaptive interview length
- Lockdown browsers or proctoring
- Automatic rejection or hiring decisions
- Multi-role or multi-level interview support
- ATS / HRIS integrations
- Custom interview logic per company

---

## 4. System Philosophy
This product is a **standardized technical interview framework**.

AI is used to:
- Enforce consistency
- Improve signal capture
- Reduce interviewer variance

AI is NOT used to:
- Replace human judgment
- Impress via “magic”
- Make irreversible hiring decisions

---

## 5. Design Invariant
If a feature:
- Reduces fairness
- Obscures evaluation criteria
- Introduces non-deterministic behavior

It must not be implemented.

This invariant supersedes all other considerations.