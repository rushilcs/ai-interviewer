export const RUNNER_CONFIG = {
  /** Per-test time limit (ms). Must account for Docker + Python startup (~1–2s); only truly slow or infinite code should hit this. */
  PER_TEST_TIMEOUT_MS: 10_000,
  /** Overall run time limit (ms) for all tests in one run. */
  OVERALL_TIMEOUT_MS: 60_000,
  /** Compile step timeout (ms) for Java/C++. */
  COMPILE_TIMEOUT_MS: 2000,
  /** Memory limit (MB). */
  MEMORY_MB: 256,
  /** Max stdout+stderr size (bytes). */
  MAX_OUTPUT_BYTES: 64 * 1024,
  /** Max code length (bytes). */
  MAX_CODE_BYTES: 50 * 1024,
  /** Docker image name. */
  DOCKER_IMAGE: "ai-interviewer-runner:latest"
};

export const PROBLEM_FN: Record<
  string,
  { fn: string; argKeys: string[] }
> = {
  ndcg_at_k: {
    fn: "ndcg_at_k",
    argKeys: ["predicted_ids", "relevance_map", "k"]
  },
  rerank_with_author_cap: {
    fn: "rerank_with_author_cap",
    argKeys: ["items", "k", "cap"]
  }
};
