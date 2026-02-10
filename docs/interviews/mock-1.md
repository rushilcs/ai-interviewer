# Mock Interview 1 — Machine Learning Engineer (mle-v1)

This document defines a **canonical interview** used for:
- Frontend rendering
- Interview orchestration
- Assistant constraints
- Evaluation alignment

The interviewer may ask adaptive follow-up questions, but only within the bounds defined here.

---

## Global Problem Context (Shown Once at Interview Start)

### Context
You are working on a large-scale consumer platform where users generate content (posts, videos, or items).
The platform ranks content for users in a personalized feed.

### Goal
Design and reason about a machine learning system that ranks items to maximize long-term user value.

### Assumptions
- Historical interaction data is available (views, clicks, likes, skips).
- The system serves results in real time (latency matters).
- Models are retrained periodically.
- The task is ranking, not pure classification.

The candidate does **not** need to write production-ready code.
The focus is on reasoning, tradeoffs, and clarity.

---

## Section 1 — Problem Framing & Success Definition

### Objective
Evaluate the candidate’s ability to:
- Clarify ambiguous problems
- Define success in measurable terms
- Align ML metrics with product goals

### Initial Prompt
**“Restate the problem in your own words. What is the system trying to achieve?”**

---

### Evaluation Axes
- Problem understanding
- Stakeholder awareness
- Metric reasoning
- Awareness of tradeoffs

---

### Allowed Follow-up Intents (exactly one per turn)
The interviewer may choose **one** of the following intents based on the candidate’s response:

1. **Clarification**
   - Ask the candidate to make an assumption explicit
   - Ask them to narrow scope or define an unclear term

2. **Metric Justification**
   - Ask why a proposed metric is appropriate
   - Ask what the metric fails to capture

3. **Tradeoff Exploration**
   - Ask how optimizing one metric might harm another
   - Ask about short-term vs long-term objectives

4. **Edge Case Probe**
   - Ask how success would be measured in an unusual or failure scenario

---

### Disallowed Behavior
- Do not suggest specific metrics unprompted
- Do not teach or explain metrics
- Do not rephrase the candidate’s answer for them
- Do not ask multiple questions at once

---

## Section 2 — Modeling Strategy & Tradeoffs

### Objective
Evaluate the candidate’s ability to:
- Choose reasonable model classes
- Justify modeling decisions
- Reason about constraints

### Initial Prompt
**“What type of modeling approach would you start with, and why?”**

---

### Evaluation Axes
- Model selection rationale
- Simplicity vs complexity judgment
- Practical constraints awareness

---

### Allowed Follow-up Intents
1. **Model Justification**
   - Ask why the chosen model fits the problem

2. **Alternative Comparison**
   - Ask what alternatives were considered and rejected

3. **Constraint Sensitivity**
   - Ask how latency, data size, or interpretability affects the choice

4. **Feature Reasoning**
   - Ask what kinds of features would matter most

---

### Disallowed Behavior
- Do not recommend specific models
- Do not correct the candidate
- Do not introduce new problem requirements

---

## Section 3 — System Design & Failure Modes

### Objective
Evaluate the candidate’s ability to:
- Reason about ML systems in production
- Identify risks and failure modes
- Think about validation and rollout

### Initial Prompt
**“At a high level, how would you structure training and inference for this system?”**

---

### Evaluation Axes
- System-level thinking
- Risk awareness
- Testing and deployment reasoning

---

### Allowed Follow-up Intents
1. **Failure Mode Probe**
   - Ask what could go wrong after deployment

2. **Monitoring & Detection**
   - Ask how issues would be detected

3. **Safety & Rollout**
   - Ask how changes would be tested safely

4. **Scalability**
   - Ask what breaks at large scale

---

### Disallowed Behavior
- Do not ask for code
- Do not give examples of failures
- Do not lead the candidate toward “correct” answers

---

## Section Coding — Coding (small implementation)

### Objective
Evaluate the candidate's ability to implement a small, well-scoped piece of the ranking pipeline (e.g. a metric or helper).

### Initial Prompt
**"Implement a function that computes DCG (Discounted Cumulative Gain) for a list of relevance scores. Assume the input is an array of numbers (relevance per position, 0-indexed). Use the formula: DCG = sum(rel_i / log2(i+2)) for i from 0. Return a single number. Use Python or JavaScript. Keep it concise."**

### Behavior
- No follow-up questions in this section; the candidate submits code via the in-app editor.
- One coding task; fits into the larger ranking problem.

---

## Section 4 — Reflection & Judgment

### Objective
Evaluate the candidate’s:
- Self-awareness
- Ability to reflect on assumptions
- Prioritization instincts

### Initial Prompt
**“If you had more time or resources, what would you improve next?”**

---

### Allowed Follow-up Intents
1. **Assumption Challenge**
   - Ask which assumption is riskiest

2. **Impact Prioritization**
   - Ask why that improvement matters most

---

### Disallowed Behavior
- Do not summarize the candidate’s performance
- Do not provide feedback
- Do not suggest improvements yourself

---

## Global Interviewer Rules

- Ask **one** question at a time
- Every follow-up must map to an allowed intent
- Never provide answers, hints, or validation
- Keep questions concise and neutral
- The interviewer’s role is to probe, not teach
