# Evaluation and Scoring Spec (Design Only, No Code)
*(Authoritative specification for how interview data is transformed into signals, metrics, and reviewer-facing artifacts.)*

## 0. Purpose
The Evaluation and Scoring System (ESS) converts raw interview artifacts into:
- Structured, reviewable evidence
- Quantitative metrics that summarize performance
- Clear signals to support (not replace) human hiring decisions

This system must be **transparent, explainable, deterministic, and auditable**.

The ESS does NOT make hiring decisions.

---

## 1. Core Principles (Non-Negotiable)

1. **Human-in-the-loop**
   - Final decisions are made by humans
   - Scores are advisory only

2. **Evidence-first**
   - Every score must map to concrete evidence
   - Reviewers must be able to trace metrics back to transcript or code

3. **Reasoning over correctness**
   - Thought process and tradeoffs outweigh final answers
   - Partial solutions with strong reasoning score well

4. **Determinism**
   - Same inputs produce the same outputs
   - No adaptive or personalized scoring

5. **Section-aligned evaluation**
   - Each interview section is evaluated independently
   - Section responsibilities must not overlap ambiguously

---

## 2. Inputs to Evaluation System

### 2.1 Primary Inputs
For each interview instance:
- Full interview event log
- Section artifacts (from orchestration engine):
  - Raw transcript
  - Section summaries
  - Coverage flags
  - Exit reasons
- Code artifacts (Section 3 only):
  - Final submission
  - Intermediate submissions
  - Test results (if applicable)

### 2.2 Secondary Inputs (Contextual Only)
- Assistant usage logs
- Timing data (time per section, overruns, disconnects)

These inputs must NOT directly impact scores.

---

## 3. Evaluation Structure Overview

Evaluation proceeds in three layers:

1. **Signal Extraction**
2. **Metric Computation**
3. **Score Aggregation (Weighted, Configurable)**

Each layer is independent and auditable.

---

## 4. Signal Extraction Layer

### 4.1 Signal Definition
A signal is a binary or ordinal indicator derived from evidence.

Examples:
- "Candidate identified evaluation metric"
- "Candidate discussed data leakage"
- "Candidate articulated tradeoff between model complexity and latency"

Signals are:
- Section-scoped
- Explicitly defined
- Extracted deterministically

---

### 4.2 Signal Categories by Section

#### Section 1: Problem Framing & Clarification
Signals include:
- Problem restatement clarity
- Identification of stakeholders
- Metric definition
- Constraint awareness
- Assumption articulation

---

#### Section 2: Modeling Strategy & Tradeoffs
Signals include:
- Model family justification
- Feature strategy discussion
- Tradeoff awareness
- Failure mode identification
- Deployment considerations

---

#### Section 3: Coding Exercise
Signals include:
- Correctness of core logic
- Handling of edge cases
- Code readability
- Algorithmic efficiency awareness
- Test result interpretation

---

#### Section 4: Reflection
Signals include:
- Self-critique quality
- Identification of limitations
- Proposed improvements
- Awareness of real-world constraints

---

### 4.3 Signal Extraction Rules
- Signals must map to explicit evidence
- Signals cannot be inferred from silence
- Absence of evidence ≠ negative signal; it is neutral

Signal extraction may be implemented via:
- Heuristic rules (MVP)
- Deterministic LLM extraction with fixed prompts
- Hybrid approaches

---

## 5. Metric Computation Layer

### 5.1 Metric Definition
A metric is a numerical summary derived from one or more signals.

Metrics are normalized to a fixed scale (e.g., 0–5 or 0–1).

---

### 5.2 Core Metrics (MVP)

#### 5.2.1 Reasoning Quality
Derived from:
- Signal density across sections
- Clarity of explanations
- Logical coherence

---

#### 5.2.2 Problem Decomposition
Derived from:
- Framing signals
- Structured thinking indicators
- Section 1 coverage

---

#### 5.2.3 Modeling Judgment
Derived from:
- Section 2 tradeoff signals
- Practical ML awareness
- Failure mode discussion

---

#### 5.2.4 Implementation Quality
Derived from:
- Coding correctness
- Code clarity
- Edge case handling

---

#### 5.2.5 Reflection & Maturity
Derived from:
- Section 4 signals
- Self-awareness indicators

---

### 5.3 Timing and Assistance Metrics (Contextual)
Collected but not scored directly:
- Time usage per section
- Assistant usage frequency
- Disconnect events

These are displayed as context only.

---

## 6. Scoring Layer (Aggregation)

### 6.1 Section Scores
Each section produces:
- Section-level metrics
- Section summary text
- Highlighted evidence snippets

Section scores are computed independently.

---

### 6.2 Overall Score (Advisory)
An overall score is computed as a weighted combination of metrics.

Default MVP weights (example):
- Reasoning Quality: 30%
- Problem Decomposition: 20%
- Modeling Judgment: 25%
- Implementation Quality: 15%
- Reflection & Maturity: 10%

Weights are:
- Fixed in MVP
- Visible to ops
- Configurable in later versions

---

### 6.3 Score Interpretation Bands
Scores may be mapped to qualitative bands:

Example:
- Strong Signal
- Mixed Signal
- Weak Signal

These bands are advisory labels only.

---

## 7. Evidence Presentation (Reviewer-Facing)

For each metric, reviewers must see:
- Score value
- Short explanation of what the score represents
- Linked evidence:
  - Transcript quotes with timestamps
  - Code excerpts
  - Test outputs (if applicable)

No score may appear without evidence.

---

## 8. Reviewer UI Requirements (Evaluation Output)

The evaluation output must support:
- Section-by-section review
- Metric breakdowns
- Evidence drill-down
- Full interview replay
- Assistant usage visibility

Reviewers must be able to answer:
"Why did this candidate receive this score?"

---

## 9. Fairness and Bias Safeguards

- No demographic data used
- No personalization
- No adaptive scoring
- Assistant usage not penalized
- Time overruns not penalized unless extreme (context only)

The system must not infer:
- Confidence
- Seniority
- Communication style preference

Only explicit evidence is scored.

---

## 10. Failure Modes and Handling

### 10.1 Incomplete Interviews
If an interview ends early:
- Score only completed sections
- Clearly label missing sections
- Do not extrapolate

---

### 10.2 Partial Code Submissions
- Evaluate what exists
- Do not assume intent
- Reward clear reasoning even if incomplete

---

### 10.3 Extraction Failures
If signal extraction fails:
- Flag section as "evaluation incomplete"
- Surface raw evidence to reviewer
- Do not fabricate scores

---

## 11. Determinism Guarantees

The system must guarantee:
- Fixed prompts and rules for extraction
- Stable metric formulas
- Repeatable outputs given identical inputs
- Versioned evaluation logic

---

## 12. Versioning

Each evaluation output must include:
- Evaluation schema version
- Signal definitions version
- Metric weights version

This allows historical comparisons and audit.

---

## 13. Explicit Non-Goals

The evaluation system will NOT:
- Auto-reject or auto-advance candidates
- Predict job performance
- Replace technical interviewers
- Optimize for speed over evidence
- Provide candidate-facing scores (MVP)

---

## 14. MVP Defaults

- Fixed metric set
- Fixed weights
- Evidence-linked scoring
- No model-based ranking across candidates
- Human review required

---

## 15. Deliverables Checklist

- Signal definitions per section
- Metric definitions and formulas
- Section-level summaries
- Overall advisory score
- Evidence-linked reviewer artifacts
- Versioned, auditable outputs