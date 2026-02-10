# Mock MLE Interview — Complete Specification (Evaluation & Ground Truth)

This document is the **single complete reference** for the mock Machine Learning Engineer interview (mle-v1): all sections, initial questions, follow-up intents, disallowed behavior, the LLM follow-up prompt and generation logic, and the coding section. Use it for evaluation design and ground-truth alignment.

**Source of truth in code:** `backend/src/specs/mock-1.ts` (section content), `backend/src/services/interviewer/followUp.ts` (LLM prompt), `backend/src/coding/problems.ts` (coding problems), `backend/src/schemas/mle-v1.json` (section order and durations).

---

## 1. Global Problem Context (Shown to Candidate at Start)

This context is shown once at interview start. Stored in the spec as `problem_context`.

```
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
```

---

## 2. Global Interviewer Rules

These apply to every section (except Coding, where the interviewer does not ask questions).

- Ask **one** question at a time.
- Every follow-up must map to an **allowed intent** for that section.
- Never provide answers, hints, or validation.
- Keep questions concise and neutral.
- The interviewer's role is to probe, not teach.

---

## 3. Section Order and Durations

From `backend/src/schemas/mle-v1.json`. Sections are run in this order:

| Order | Section ID        | Section Name                         | Duration |
|-------|-------------------|--------------------------------------|----------|
| 1     | section_1         | Problem Framing & Success Definition | 600 s (10 min)  |
| 2     | section_2         | Modeling Strategy & Tradeoffs        | 900 s (15 min)  |
| 3     | section_3         | System Design & Failure Modes        | 900 s (15 min)  |
| 4     | section_coding    | Coding                               | 600 s (10 min)  |
| 5     | section_4         | Reflection & Judgment                 | 300 s (5 min)   |

---

## 4. Sections 1–4: Initial Questions, Follow-ups, Disallowed

### 4.1 Section 1 — Problem Framing & Success Definition

- **Section ID:** `section_1`
- **Objective:** Evaluate the candidate's ability to: clarify ambiguous problems; define success in measurable terms; align ML metrics with product goals.

**Initial prompt (exact text):**
> Restate the problem in your own words. What is the system trying to achieve?

**Allowed follow-up intents (exactly one per turn):**

| Intent                | Description |
|-----------------------|-------------|
| Clarification         | Ask the candidate to make an assumption explicit; ask them to narrow scope or define an unclear term. |
| Metric Justification  | Ask why a proposed metric is appropriate; ask what the metric fails to capture. |
| Tradeoff Exploration  | Ask how optimizing one metric might harm another; ask about short-term vs long-term objectives. |
| Edge Case Probe       | Ask how success would be measured in an unusual or failure scenario. |

**Disallowed behavior:**
- Do not suggest specific metrics unprompted.
- Do not teach or explain metrics.
- Do not rephrase the candidate's answer for them.
- Do not ask multiple questions at once.

---

### 4.2 Section 2 — Modeling Strategy & Tradeoffs

- **Section ID:** `section_2`
- **Objective:** Evaluate the candidate's ability to: choose reasonable model classes; justify modeling decisions; reason about constraints.

**Initial prompt (exact text):**
> What type of modeling approach would you start with, and why?

**Allowed follow-up intents:**

| Intent                 | Description |
|------------------------|-------------|
| Model Justification    | Ask why the chosen model fits the problem. |
| Alternative Comparison | Ask what alternatives were considered and rejected. |
| Constraint Sensitivity | Ask how latency, data size, or interpretability affects the choice. |
| Feature Reasoning      | Ask what kinds of features would matter most. |

**Disallowed behavior:**
- Do not recommend specific models.
- Do not correct the candidate.
- Do not introduce new problem requirements.

---

### 4.3 Section 3 — System Design & Failure Modes

- **Section ID:** `section_3`
- **Objective:** Evaluate the candidate's ability to: reason about ML systems in production; identify risks and failure modes; think about validation and rollout.

**Initial prompt (exact text):**
> At a high level, how would you structure training and inference for this system?

**Allowed follow-up intents:**

| Intent              | Description |
|---------------------|-------------|
| Failure Mode Probe  | Ask what could go wrong after deployment. |
| Monitoring & Detection | Ask how issues would be detected. |
| Safety & Rollout   | Ask how changes would be tested safely. |
| Scalability        | Ask what breaks at large scale. |

**Disallowed behavior:**
- Do not ask for code.
- Do not give examples of failures.
- Do not lead the candidate toward "correct" answers.

---

### 4.4 Section 4 — Reflection & Judgment

- **Section ID:** `section_4`
- **Objective:** Evaluate the candidate's: self-awareness; ability to reflect on assumptions; prioritization instincts.

**Initial prompt (exact text):**
> If you had more time or resources, what would you improve next?

**Allowed follow-up intents:**

| Intent                 | Description |
|------------------------|-------------|
| Assumption Challenge   | Ask which assumption is riskiest. |
| Impact Prioritization  | Ask why that improvement matters most. |

**Disallowed behavior:**
- Do not summarize the candidate's performance.
- Do not provide feedback.
- Do not suggest improvements yourself.

---

## 5. Section Coding — No Interviewer Prompts

- **Section ID:** `section_coding`
- **Objective:** Evaluate the candidate's ability to implement a small, well-scoped piece of the ranking pipeline (e.g. a metric or helper).

**Behavior:** The interviewer **does not** ask any questions in this section. No initial prompt is presented to the candidate in the chat; the coding UI and problem statements are the only content. Implementation: `backend/src/services/orchestration/interviewer.ts` returns `{ action: "none" }` when `current_section_id === "section_coding"`.

The spec in `mock-1.ts` still contains an `initial_prompt` and empty `allowed_follow_up_intents` / `disallowed` for this section (for legacy/spec consistency); they are **not** used in the flow.

---

## 6. Coding Section: Problems and Tests

Coding problems are defined in `backend/src/coding/problems.ts`. The candidate sees a **problem context** (from the spec) and two problems. They may **Run** (public tests only) as often as they like and **Submit** once per problem; after submit, that problem’s code is locked.

### 6.1 Problem context (shown in coding UI)

Same as the global problem context in Section 1 (large-scale consumer platform, ranking, etc.). The coding section objective is: implement a small, well-scoped piece of the ranking pipeline (e.g. a metric or helper).

### 6.2 Problem 1 — NDCG@K for a Ranked List

- **Problem ID:** `ndcg_at_k`
- **Title:** NDCG@K for a Ranked List

**Statement (markdown, shown to candidate):**

```markdown
## NDCG@K for a Ranked List

After the model produces a ranked list, you need to compute an offline ranking metric to evaluate quality.

**Task:** Implement `ndcg_at_k(predicted_ids, relevance_map, k)` that returns NDCG@K.

**Definitions:**
- `predicted_ids`: array of item IDs (strings or ints) in predicted rank order (best first).
- `relevance_map`: map from item ID to nonnegative relevance score. Missing IDs have relevance 0.
- `k`: integer cutoff.

**Compute:**
- DCG@K = sum_{i=0..k-1} rel_i / log2(i+2), where rel_i is relevance of predicted_ids[i].
- IDCG@K = DCG@K of the ideal ordering: top-k relevance scores (sorted descending), same discount.
- NDCG@K = DCG@K / IDCG@K; if IDCG@K == 0, return 0.

**Requirements:** Handle k > len(predicted_ids). Use float return; comparisons use tolerance 1e-6.
```

**Constraints:**  
- 1 ≤ N ≤ 2e5; target O(k log k) or better.  
- Use double/float with tolerance 1e-6 for comparisons.

**Signatures:**
- **Python:** `def ndcg_at_k(predicted_ids: list, relevance_map: dict, k: int) -> float`
- **Java:** `static double ndcgAtK(List<?> predictedIds, Map<?, Double> rel, int k)`
- **C++:** `double ndcgAtK(const vector<Id>& predicted, const unordered_map<Id,double>& rel, int k)`

**Tests:** 5 public + 5 hidden. **Comparison:** float equality with tolerance **1e-6**.

**Public test inputs (summary):**  
- Perfect order [1,2,3] → 1.0; reversed [3,2,1] → ~0.79; zeros in relevance; empty relevance_map → 0.0; partial relevance map with k=3.

**Hidden tests:** Cover k > len(predicted_ids), empty predicted_ids, ideal ordering, tie cases, single-relevance cases.

---

### 6.3 Problem 2 — Top-K Rerank with Per-Author Exposure Cap

- **Problem ID:** `rerank_with_author_cap`
- **Title:** Top-K Rerank with Per-Author Cap

**Statement (markdown, shown to candidate):**

```markdown
## Top-K Rerank with Per-Author Exposure Cap

The model produces a scored candidate set, but product constraints require limiting exposure per creator in the feed.

**Task:** Implement `rerank_with_author_cap(items, k, cap)` returning the selected item IDs in final order.

**Input:**
- `items`: list of [item_id, author_id, score]. Higher score is better.
- `k`: number of items to output (k ≤ len(items)).
- `cap`: max items per author in the output (cap ≥ 1).

**Output:** List of up to k item_ids, in selected order.

**Selection rule (deterministic):**
- Sort all items by score descending; break ties by item_id ascending.
- Traverse sorted list; pick an item if its author has been picked < cap times; stop when you have k items or exhaust.
```

**Constraints:**  
- O(N log N); deterministic tie-break (item_id ascending).  
- If fewer than k items can be chosen due to caps, return as many as possible.

**Signatures:**
- **Python:** `def rerank_with_author_cap(items: list, k: int, cap: int) -> list`
- **Java:** `static List<?> rerankWithAuthorCap(List<Item> items, int k, int cap)`
- **C++:** `vector<Id> rerankWithAuthorCap(vector<Item> items, int k, int cap)`

**Tests:** 5 public + 5 hidden. **Comparison:** exact match of output list (order and values).

**Public test inputs (summary):**  
- Cap 1 per author, 3 items out of 4; cap 2, multi-author; string IDs, tie-break by item_id; same score tie-break; larger k and many authors.

**Hidden tests:** Same-score tie-break, cap 2 with 4 items, single item, three authors with ties, large list (500 items, cap 1, k=20).

---

## 7. How the LLM Generates Follow-up Questions

Follow-ups are generated only for **section_1, section_2, section_3, section_4**. Coding is excluded.

**Implementation file:** `backend/src/services/interviewer/followUp.ts`

### 7.1 When the LLM is invoked

- After the **initial** prompt for the section has already been presented (from the spec).
- After the candidate sends a **CANDIDATE_MESSAGE** (their answer).
- The orchestration layer calls `generateFollowUpQuestion(args)` once per candidate message when deciding the next prompt. See `backend/src/routes/talent/index.ts` (`runInterviewerAndAppendIfNeeded`) and `backend/src/services/orchestration/interviewer.ts` (`decideNextPrompt`): if the last event in the section is `CANDIDATE_MESSAGE`, the decision is `ask_followup` and the route calls the follow-up generator.

**Cap:** At most **1 initial + 4 follow-ups** per section (`MAX_FOLLOWUPS_PER_SECTION = 4` in `interviewer.ts`). After that, no more prompts are asked in that section.

### 7.2 Inputs to the LLM (GenerateFollowUpArgs)

| Argument | Description |
|----------|-------------|
| `section_id` | Current section (e.g. `section_1`). Used to load that section’s allowed intents and disallowed list. |
| `last_candidate_message` | The candidate’s most recent reply (plain text). Truncated to 2000 chars for the user message. |
| `recent_questions_in_section` | Optional. List of question texts already asked in this section. Injected into the system prompt so the LLM does not repeat or rephrase them. |
| `previous_sections_transcript` | Optional. Transcript of Q&A from **earlier** sections only (format: "Section [name]: Q: ... A: ..."). Truncated to 6000 chars. Injected so the LLM does not ask something already answered in a previous section. |

### 7.3 System prompt (exact template)

The system prompt is built as follows. `${intentsText}` is the section’s allowed intents, one per line: `- **Name**: description`. `${disallowedText}` is the section’s disallowed list, one per line. `${recentBlock}` and `${previousSectionsBlock}` are optional blocks described below.

```
You are the interviewer in a technical ML interview. Your only job is to ask exactly ONE concise follow-up question, OR to signal that no more follow-ups are needed.

WHEN TO OUTPUT [NO_MORE_FOLLOWUPS]: Only when the candidate has **substantively answered** the question and provided sufficient depth, detail, and expansion on their thoughts. You must be confident they engaged with the question.

NEVER output [NO_MORE_FOLLOWUPS] when the candidate:
- Refuses to answer, says they don't want to answer, or asks to skip or move on (e.g. "let's move on", "I don't want to answer", "skip this", "next question").
- Gives a non-answer, deflects, or clearly avoids the question.
- Says they don't know without any attempt to reason or speculate.

In those cases you MUST ask a follow-up: rephrase the question, ask from a different angle, or politely ask them to engage with the topic (e.g. "Could you give a high-level take, even if brief?"). Do not let the candidate end the section by refusing—only you decide when the section has enough depth.

When the candidate has substantively answered and you have enough depth, output exactly this line and nothing else:
[NO_MORE_FOLLOWUPS]

Otherwise, ask exactly one follow-up question. You may ask between 2 and 4 follow-ups in total in this section—you do NOT need to use all 4. Only output [NO_MORE_FOLLOWUPS] when they have actually engaged and provided substance.

RULES (strict):
1. You must choose exactly ONE of the allowed follow-up intents listed below. Your question must fit that intent.
2. Your question must be grounded in the candidate's most recent answer. Reference or build on what they said.
3. Do NOT ask a question that the candidate has already answered—in this section or in a previous section. If they addressed something you were going to ask, skip that and ask a different angle, or go deeper on an under-explored point. Never ask them to repeat or reiterate what they already said.
4. Ask only one question. Do not ask multiple questions in one turn.
5. Do not provide hints, explanations, metrics, corrections, or validation. Do not teach.
6. Keep the question concise and neutral (one or two sentences). Encourage the candidate to expand on their thoughts where they have been brief or where more depth would help.
7. Do not do any of the disallowed behaviors listed below.<RECENT_BLOCK><PREVIOUS_SECTIONS_BLOCK>

Allowed follow-up intents for this section (choose one):
<INTENTS_FROM_SPEC>

Disallowed behavior:
<DISALLOWED_FROM_SPEC>

Output only either: (a) the single follow-up question, with no prefix, no numbering, no explanation; or (b) exactly [NO_MORE_FOLLOWUPS] if no further follow-up is needed.
```

**RECENT_BLOCK** (if `recent_questions_in_section` is non-empty):
```
8. Do NOT ask a question that is similar to or rephrases any of these already-asked questions in this section:
- "<question 1>"
- "<question 2>"
...
Choose a different angle or intent. Never ask the candidate to reiterate what they already said.
```

**PREVIOUS_SECTIONS_BLOCK** (if `previous_sections_transcript` is non-empty):
```
LONG-TERM MEMORY — Transcript from earlier sections of this interview. You must not ask the candidate to repeat or re-cover ground they have already addressed. Do NOT ask a question that is substantially the same as one they already answered in a previous section.

Earlier sections:
<transcript, up to 6000 chars>
```

### 7.4 User message to the LLM

```
Candidate's most recent answer:

<last_candidate_message, up to 2000 chars>
```

### 7.5 API and decoding

- **Model:** `OPENAI_MODEL` env var, default `gpt-4.1-mini`.
- **Temperature:** 0.2
- **max_tokens:** 150
- **Messages:** one `system` (the prompt above), one `user` (candidate’s answer).

### 7.6 Output handling

1. **Raw response:** `completion.choices[0].message.content` trimmed; leading/trailing single or double quotes stripped.
2. **Sentinel:** If the response contains (case-insensitive) `[NO_MORE_FOLLOWUPS]` or equals that string exactly, the LLM is treated as “no more follow-ups.”
3. **Refusal override:** If the LLM output `[NO_MORE_FOLLOWUPS]` but the candidate’s message matches **refusal/skip** phrases, the code **ignores** the sentinel and returns a fixed follow-up:  
   `"Could you give a high-level take on that, even if brief? We can then move on."`
4. **Refusal/skip detection:** The following substrings (in the candidate’s last message, lowercased) trigger the override:  
   `"don't want to answer"`, `"dont want to answer"`, `"let's move on"`, `"lets move on"`, `"move on"`, `"skip this"`, `"skip the question"`, `"next question"`, `"next section"`, `"don't know"`, `"dont know"`, `"no idea"`, `"pass on this"`, `"rather not answer"`, `"prefer not to answer"`, `"can we skip"`, `"want to skip"`.
5. **Normal [NO_MORE_FOLLOWUPS]:** Function returns `{ text: null }`; orchestration records `INTERVIEWER_SECTION_SATISFIED` and does not add another prompt.
6. **Empty response:** If the model returns no usable question text, fallback: `"Could you elaborate on that?"`

---

## 8. Code Reference

| Concern | File(s) |
|--------|---------|
| Section definitions (initial prompts, intents, disallowed) | `backend/src/specs/mock-1.ts` |
| Section order and durations | `backend/src/schemas/mle-v1.json` |
| Prompt catalog (initial prompt per section) | `backend/src/prompts/mle-v1.ts` |
| When to ask initial vs follow-up; coding excluded | `backend/src/services/orchestration/interviewer.ts` |
| LLM follow-up generation (prompt, API, output handling) | `backend/src/services/interviewer/followUp.ts` |
| Coding problems and tests | `backend/src/coding/problems.ts` |
| Human-readable section doc | `docs/interviews/mock-1.md` |

This file is the complete spec for evaluation and ground-truth design. For any discrepancy, the code files above are authoritative.
