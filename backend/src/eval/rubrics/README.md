# Evaluation rubrics

Interview-specific rubric configs for the LLM judge evaluator.

## To add a new interview evaluation

1. Create a new rubric file (e.g. `my-interview.ts`) in this directory.
2. Export an object that satisfies the `RubricConfig` interface from `./types`:
   - `schemaVersion`: string matching the interview schema (e.g. `"mle-v1"`).
   - `sections`: map of `section_id` → `SectionRubricConfig` (only non-coding sections need entries; coding is scored deterministically).
3. Each `SectionRubricConfig` has:
   - `score_range`: `[0, 1]`
   - `base_rubric_prompt`: criteria for grading the **initial question** only (same for all candidates).
   - `followup_scoring_rules`: instructions for grading answers to **follow-ups that were actually asked** (adherence + substantive detail).
   - `anchors` (optional): calibration descriptions for 0.2, 0.6, 0.9.
4. Register the config in `getRubricConfig()` in `types.ts` (add a case for your `schemaVersion` and return the imported config).

The evaluator in `backend/src/services/evaluation/llmJudgeEvaluator.ts` loads the rubric by `schemaVersion` and uses it for the two-pass (extraction → scoring) LLM judge.
