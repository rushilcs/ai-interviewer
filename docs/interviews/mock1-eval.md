# Mock MLE Interview — Evaluation & Scoring Specification (mock1-eval)
*(Concrete, deterministic instantiation of the Evaluation and Scoring Spec for the mle-v1 interview.)*

This document defines the **exact signals, metrics, scoring rules, and evidence requirements** used to evaluate the Mock Machine Learning Engineer interview (`mle-v1`).

It is **role-specific**, **versioned**, and **deterministic**.

Source of truth for implementation:
- `evaluation_version`: `ess-v1`
- `signal_defs_version`: `mock1-signals-v1`
- `metric_weights_version`: `mock1-weights-v1`

---

## 1. Evaluation Philosophy (Mock-Specific)

- Only the **first question per section is guaranteed**.
- Follow-up questions vary dynamically.
- Therefore, **scoring is based on demonstrated competencies**, not on which prompts were asked.
- A candidate is rewarded for *what they explicitly articulate*, anywhere within the section.

No signal depends on:
- A specific follow-up being asked
- Exact phrasing
- Order of ideas

---

## 2. Evidence Model (Applied Strictly)

All signals must be backed by **explicit evidence** derived from:
- `CANDIDATE_MESSAGE` events
- Coding submissions and test results

Valid evidence pointer types:
- `transcript_quote`
- `event_range`
- `code_excerpt`
- `test_output`

LLMs **may select or summarize** evidence, but **may not invent or infer evidence**.

---

## 3. Signal Scoring Scale

All signals use a **3-point ordinal scale**:

| Value | Meaning |
|------:|--------|
| 0 | Not demonstrated |
| 1 | Partially demonstrated |
| 2 | Clearly and explicitly demonstrated |

Absence of evidence → `0`  
Weak / implicit / vague evidence → `1`  
Explicit, well-reasoned evidence → `2`

---

## 4. Section-Level Signals

### 4.1 Section 1 — Problem Framing & Success Definition

**Objective:** Evaluate problem understanding, success criteria, and metric reasoning.

#### Signals

**S1.1 — Problem Restatement Clarity**
- 0: Restates problem incorrectly or vaguely
- 1: Restates core goal but misses scope or ambiguity
- 2: Clearly restates goal, constraints, and ambiguity

**Evidence:** transcript_quote

---

**S1.2 — Success Metric Identification**
- 0: No success metric mentioned
- 1: Mentions metric without justification
- 2: Defines metric(s) and ties to product goal

Examples of valid metrics:
- Ranking metrics (NDCG, MAP)
- Engagement proxies (CTR, dwell time)
- Long-term objectives (retention)

---

**S1.3 — Metric Tradeoff Awareness**
- 0: No discussion of tradeoffs
- 1: Mentions tradeoff superficially
- 2: Explicitly explains tradeoffs (e.g., short vs long term)

---

**S1.4 — Constraint Awareness**
- 0: No constraints mentioned
- 1: Mentions one constraint (latency, data, scale)
- 2: Mentions multiple constraints and their impact

---

**S1.5 — Assumption Articulation**
- 0: No assumptions stated
- 1: Implicit assumptions
- 2: Explicit assumptions and why they matter

---

### 4.2 Section 2 — Modeling Strategy & Tradeoffs

**Objective:** Evaluate modeling judgment and practical ML reasoning.

#### Signals

**S2.1 — Model Class Justification**
- 0: No model choice or unjustified choice
- 1: Mentions model class with shallow reasoning
- 2: Justifies model choice relative to ranking task

---

**S2.2 — Alternative Consideration**
- 0: No alternatives mentioned
- 1: Mentions alternatives without reasoning
- 2: Compares alternatives and explains rejection

---

**S2.3 — Feature Reasoning**
- 0: No feature discussion
- 1: Mentions generic features
- 2: Discusses feature types + signal value

---

**S2.4 — Constraint Sensitivity**
- 0: Ignores constraints
- 1: Mentions constraint abstractly
- 2: Explains how constraints affect modeling choice

---

**S2.5 — Failure Mode Awareness**
- 0: No risks discussed
- 1: Mentions a risk
- 2: Explains failure modes and consequences

---

### 4.3 Section 3 — System Design & Failure Modes

**Objective:** Evaluate production ML system thinking.

#### Signals

**S3.1 — Training vs Inference Separation**
- 0: No system structure
- 1: High-level structure
- 2: Clear training/inference separation

---

**S3.2 — Monitoring & Detection**
- 0: No monitoring mentioned
- 1: Mentions monitoring
- 2: Specifies what is monitored and why

---

**S3.3 — Safe Rollout Strategy**
- 0: No rollout discussion
- 1: Mentions testing vaguely
- 2: Explicit strategies (A/B, shadow, canary)

---

**S3.4 — Scalability Awareness**
- 0: No scale discussion
- 1: Mentions scale
- 2: Explains what breaks at scale

---

### 4.4 Section 4 — Reflection & Judgment

**Objective:** Evaluate self-awareness and prioritization.

#### Signals

**S4.1 — Limitation Awareness**
- 0: No limitations acknowledged
- 1: Generic limitation
- 2: Specific, meaningful limitation

---

**S4.2 — Improvement Prioritization**
- 0: No improvements proposed
- 1: Proposes improvement without justification
- 2: Prioritizes improvement with rationale

---

**S4.3 — Judgment Under Uncertainty**
- 0: Avoids uncertainty
- 1: Acknowledges uncertainty
- 2: Explicitly reasons under uncertainty

---

## 5. Coding Section Signals

### Section Coding — Implementation Quality

#### Signals

**C1 — Functional Correctness**
- 0: Fails core logic
- 1: Partial correctness
- 2: Correct per tests

(Evidence: test_output)

---

**C2 — Edge Case Handling**
- 0: No edge cases
- 1: Handles some
- 2: Explicit edge case handling

---

**C3 — Algorithmic Efficiency Awareness**
- 0: Inefficient or unaware
- 1: Mentions complexity
- 2: Demonstrates appropriate complexity

---

**C4 — Code Clarity**
- 0: Unreadable
- 1: Mostly readable
- 2: Clear structure and naming

---

## 6. Metric Computation (Deterministic)

### Metrics

**M1 — Problem Decomposition (0–1)**
- Derived from: S1.1–S1.5
- Formula: sum(signal_values) / max_possible

---

**M2 — Modeling Judgment (0–1)**
- Derived from: S2.1–S2.5

---

**M3 — System Design Reasoning (0–1)**
- Derived from: S3.1–S3.4

---

**M4 — Implementation Quality (0–1)**
- Derived from: C1–C4

---

**M5 — Reflection & Maturity (0–1)**
- Derived from: S4.1–S4.3

---

## 7. Overall Score Aggregation

Default weights (`mock1-weights-v1`):

| Metric | Weight |
|------|-------:|
| M1 — Problem Decomposition | 0.20 |
| M2 — Modeling Judgment | 0.25 |
| M3 — System Design | 0.20 |
| M4 — Implementation | 0.15 |
| M5 — Reflection | 0.10 |
| **Total** | **1.00** |

Overall score = weighted sum of metrics  
If any required metric is incomplete → overall_score = null

---

## 8. LLM Usage (Strictly Non-Scoring)

LLMs may be used **only** for:
- Section summaries (2–4 sentences)
- Selecting the best quote span from pre-extracted evidence

LLMs must not:
- Assign scores
- Create evidence
- Change signal values

---

## 9. Determinism & Auditability

Given:
- Same interview events
- Same evaluation_version
- Same signal_defs_version
- Same metric_weights_version

The output **must be identical**.

---

## 10. Non-Goals

This evaluation does NOT:
- Predict job performance
- Rank candidates globally
- Penalize assistant usage
- Penalize timing overruns

---

## 11. Output Requirements

Evaluation output must include:
- Per-section signals with evidence
- Per-metric values with evidence
- Section summaries
- Overall advisory score
- Version metadata