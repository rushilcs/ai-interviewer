/**
 * Evaluation service: LLM judge (non-coding) + deterministic coding score.
 * To add a new interview eval: add a rubric in backend/src/eval/rubrics/ and register in getRubricConfig.
 */

export { runEvaluation, EvaluationNotCompletedError } from "./runEvaluation";
export {
  runLLMJudgeEvaluation,
  mapJudgeOutputToEvaluationOutput,
  computeCodingScore,
  canonicalizeSectionTranscript
} from "./llmJudgeEvaluator";
export type { JudgeOutput, JudgeSectionOutput, LlmJudgeResult, CanonicalTurn } from "./llmJudgeEvaluator";
export type { EvaluationOutput, MetricOutput, SectionEvaluation, EvidencePointer, SignalOutput } from "./types";
export { EVALUATION_VERSION, MOCK1_METRIC_NAMES } from "./types";
