/**
 * Problem and test definitions for coding section.
 * Hidden tests are server-side only; never sent to client.
 */

import type { Language } from "../../../packages/shared/src/types";
import type { ProblemSummary, TestCaseDef } from "../../../packages/shared/src/types";

const NDCG_STATEMENT = `## NDCG@K for a Ranked List

After the model produces a ranked list, you need to compute an offline ranking metric to evaluate quality.

**Task:** Implement \`ndcg_at_k(predicted_ids, relevance_map, k)\` that returns NDCG@K.

**Definitions:**
- \`predicted_ids\`: array of item IDs (strings or ints) in predicted rank order (best first).
- \`relevance_map\`: map from item ID to nonnegative relevance score. Missing IDs have relevance 0.
- \`k\`: integer cutoff.

**Compute:**
- DCG@K = sum_{i=0..k-1} rel_i / log2(i+2), where rel_i is relevance of predicted_ids[i].
- IDCG@K = DCG@K of the ideal ordering: top-k relevance scores (sorted descending), same discount.
- NDCG@K = DCG@K / IDCG@K; if IDCG@K == 0, return 0.

**Requirements:** Handle k > len(predicted_ids). Use float return; comparisons use tolerance 1e-6.`;

const NDCG_CONSTRAINTS = `- 1 ≤ N ≤ 2e5; target O(k log k) or better.
- Use double/float with tolerance 1e-6 for comparisons.`;

const RERANK_STATEMENT = `## Top-K Rerank with Per-Author Exposure Cap

The model produces a scored candidate set, but product constraints require limiting exposure per creator in the feed.

**Task:** Implement \`rerank_with_author_cap(items, k, cap)\` returning the selected item IDs in final order.

**Input:**
- \`items\`: list of [item_id, author_id, score]. Higher score is better.
- \`k\`: number of items to output (k ≤ len(items)).
- \`cap\`: max items per author in the output (cap ≥ 1).

**Output:** List of up to k item_ids, in selected order.

**Selection rule (deterministic):**
- Sort all items by score descending; break ties by item_id ascending.
- Traverse sorted list; pick an item if its author has been picked < cap times; stop when you have k items or exhaust.`;

const RERANK_CONSTRAINTS = `- O(N log N); deterministic tie-break (item_id ascending).
- If fewer than k items can be chosen due to caps, return as many as possible.`;

export interface ProblemDef {
  id: string;
  title: string;
  statement_md: string;
  constraints_md: string;
  signatures: Record<Language, string>;
  template_by_language: Record<Language, string>;
  tests: TestCaseDef[];
  compare_tolerance?: number; // for float (NDCG)
}

const NDCG_PUBLIC: TestCaseDef[] = [
  {
    id: "ndcg_p1",
    test_index: 0,
    visibility: "public",
    input_json: { predicted_ids: [1, 2, 3], relevance_map: { 1: 3, 2: 2, 3: 1 }, k: 3 },
    expected_json: 1.0,
    tolerance: 1e-6
  },
  {
    id: "ndcg_p2",
    test_index: 1,
    visibility: "public",
    input_json: { predicted_ids: [3, 2, 1], relevance_map: { 1: 3, 2: 2, 3: 1 }, k: 3 },
    expected_json: 0.789998,
    tolerance: 1e-6
  },
  {
    id: "ndcg_p3",
    test_index: 2,
    visibility: "public",
    input_json: { predicted_ids: [10, 20, 30], relevance_map: { 10: 0, 20: 1, 30: 0 }, k: 2 },
    expected_json: 0.63093,
    tolerance: 1e-6
  },
  {
    id: "ndcg_p4",
    test_index: 3,
    visibility: "public",
    input_json: { predicted_ids: [1, 2], relevance_map: {}, k: 5 },
    expected_json: 0.0,
    tolerance: 1e-6
  },
  {
    id: "ndcg_p5",
    test_index: 4,
    visibility: "public",
    input_json: { predicted_ids: [1, 2, 3, 4], relevance_map: { 2: 2, 4: 2 }, k: 3 },
    expected_json: 0.38685280723454163,
    tolerance: 1e-6
  }
];

const NDCG_HIDDEN: TestCaseDef[] = [
  {
    id: "ndcg_h1",
    test_index: 5,
    visibility: "hidden",
    input_json: { predicted_ids: [1, 2, 3], relevance_map: { 1: 1, 2: 1, 3: 1 }, k: 10 },
    expected_json: 1.0,
    tolerance: 1e-6
  },
  {
    id: "ndcg_h2",
    test_index: 6,
    visibility: "hidden",
    input_json: { predicted_ids: [], relevance_map: { 1: 1 }, k: 3 },
    expected_json: 0.0,
    tolerance: 1e-6
  },
  {
    id: "ndcg_h3",
    test_index: 7,
    visibility: "hidden",
    input_json: {
      predicted_ids: [1, 2, 3, 4, 5],
      relevance_map: { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 },
      k: 5
    },
    expected_json: 1.0,
    tolerance: 1e-6
  },
  {
    id: "ndcg_h4",
    test_index: 8,
    visibility: "hidden",
    input_json: { predicted_ids: [2, 1, 3], relevance_map: { 1: 1, 2: 1, 3: 1 }, k: 3 },
    expected_json: 1.0,
    tolerance: 1e-6
  },
  {
    id: "ndcg_h5",
    test_index: 9,
    visibility: "hidden",
    input_json: { predicted_ids: [10, 20], relevance_map: { 10: 1 }, k: 2 },
    expected_json: 0.63093,
    tolerance: 1e-6  }
];

const RERANK_PUBLIC: TestCaseDef[] = [
  {
    id: "rerank_p1",
    test_index: 0,
    visibility: "public",
    input_json: {
      items: [
        [1, "A", 9.0],
        [2, "A", 8.0],
        [3, "B", 7.0],
        [4, "C", 6.0]
      ],
      k: 3,
      cap: 1
    },
    expected_json: [1, 3, 4]  },
  {
    id: "rerank_p2",
    test_index: 1,
    visibility: "public",
    input_json: {
      items: [
        [1, "A", 9.0],
        [2, "A", 8.0],
        [3, "A", 7.0],
        [4, "B", 6.0]
      ],
      k: 3,
      cap: 2
    },
    expected_json: [1, 2, 4]  },
  {
    id: "rerank_p3",
    test_index: 2,
    visibility: "public",
    input_json: {
      items: [
        ["x", "u", 1.0],
        ["a", "v", 1.0],
        ["b", "v", 1.0]
      ],
      k: 2,
      cap: 1
    },
    expected_json: ["a", "x"]  },
  {
    id: "rerank_p4",
    test_index: 3,
    visibility: "public",
    input_json: {
      items: [
        [1, "A", 5.0],
        [2, "B", 5.0],
        [3, "C", 5.0],
        [4, "A", 5.0]
      ],
      k: 4,
      cap: 1
    },
    expected_json: [1, 2, 3]  },
  {
    id: "rerank_p5",
    test_index: 4,
    visibility: "public",
    input_json: {
      items: (() => {
        const out: [number, string, number][] = [];
        for (let i = 0; i < 100; i++) out.push([i, `author_${i % 10}`, 100 - i]);
        return out;
      })(),
      k: 10,
      cap: 1
    },
    expected_json: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]  }
];

const RERANK_HIDDEN: TestCaseDef[] = [
  {
    id: "rerank_h1",
    test_index: 5,
    visibility: "hidden",
    input_json: {
      items: [
        [1, "A", 5.0],
        [2, "A", 5.0],
        [3, "B", 5.0]
      ],
      k: 3,
      cap: 1
    },
    expected_json: [1, 2, 3]  },
  {
    id: "rerank_h2",
    test_index: 6,
    visibility: "hidden",
    input_json: {
      items: [
        [1, "A", 10.0],
        [2, "A", 10.0],
        [3, "B", 10.0],
        [4, "B", 10.0]
      ],
      k: 4,
      cap: 2
    },
    expected_json: [1, 2, 3, 4]  },
  {
    id: "rerank_h3",
    test_index: 7,
    visibility: "hidden",
    input_json: { items: [[1, "A", 1.0]], k: 3, cap: 1 },
    expected_json: [1]  },
  {
    id: "rerank_h4",
    test_index: 8,
    visibility: "hidden",
    input_json: {
      items: [
        [3, "X", 1.0],
        [1, "Y", 1.0],
        [2, "Z", 1.0]
      ],
      k: 3,
      cap: 1
    },
    expected_json: [1, 2, 3]  },
  {
    id: "rerank_h5",
    test_index: 9,
    visibility: "hidden",
    input_json: {
      items: (() => {
        const out: [number, string, number][] = [];
        for (let i = 0; i < 500; i++) out.push([i, `a${i % 20}`, 1000 - i]);
        return out;
      })(),
      k: 20,
      cap: 1
    },
    expected_json: (() => {
      const out: number[] = [];
      for (let i = 0; i < 20; i++) out.push(i);
      return out;
    })()  }
];

const NDCG_TEMPLATES: Record<Language, string> = {
  python: `def ndcg_at_k(predicted_ids: list, relevance_map: dict, k: int) -> float:
    # Your code here
    return 0.0
`,
  java: `import java.util.*;
public class Main {
    public static double ndcgAtK(List<?> predictedIds, Map<?, Double> rel, int k) {
        // Your code here
        return 0.0;
    }
}
`,
  cpp: `#include <vector>
#include <unordered_map>
#include <cmath>
using namespace std;
double ndcgAtK(const vector<int>& predicted, const unordered_map<int,double>& rel, int k) {
    // Your code here
    return 0.0;
}
`
};

const RERANK_TEMPLATES: Record<Language, string> = {
  python: `def rerank_with_author_cap(items: list, k: int, cap: int) -> list:
    # items: list of [item_id, author_id, score]
    # Your code here
    return []
`,
  java: `import java.util.*;
public class Main {
    public static List<?> rerankWithAuthorCap(List<List<?>> items, int k, int cap) {
        // Your code here
        return new ArrayList<>();
    }
}
`,
  cpp: `#include <vector>
#include <algorithm>
using namespace std;
vector<int> rerankWithAuthorCap(vector<vector<double>>& items, int k, int cap) {
    // items: [item_id, author_id, score] - adjust types as needed
    // Your code here
    return {};
}
`
};

export const PROBLEMS: ProblemDef[] = [
  {
    id: "ndcg_at_k",
    title: "NDCG@K for a Ranked List",
    statement_md: NDCG_STATEMENT,
    constraints_md: NDCG_CONSTRAINTS,
    signatures: {
      python: "def ndcg_at_k(predicted_ids: list, relevance_map: dict, k: int) -> float",
      java: "static double ndcgAtK(List<?> predictedIds, Map<?, Double> rel, int k)",
      cpp: "double ndcgAtK(const vector<Id>& predicted, const unordered_map<Id,double>& rel, int k)"
    },
    template_by_language: NDCG_TEMPLATES,
    tests: [...NDCG_PUBLIC, ...NDCG_HIDDEN],
    compare_tolerance: 1e-6
  },
  {
    id: "rerank_with_author_cap",
    title: "Top-K Rerank with Per-Author Cap",
    statement_md: RERANK_STATEMENT,
    constraints_md: RERANK_CONSTRAINTS,
    signatures: {
      python: "def rerank_with_author_cap(items: list, k: int, cap: int) -> list",
      java: "static List<?> rerankWithAuthorCap(List<Item> items, int k, int cap)",
      cpp: "vector<Id> rerankWithAuthorCap(vector<Item> items, int k, int cap)"
    },
    template_by_language: RERANK_TEMPLATES,
    tests: [...RERANK_PUBLIC, ...RERANK_HIDDEN]
  }
];

export function getProblem(id: string): ProblemDef | undefined {
  return PROBLEMS.find((p) => p.id === id);
}

export function getProblemSummaries(): ProblemSummary[] {
  return PROBLEMS.map((p) => ({
    id: p.id,
    title: p.title,
    statement_md: p.statement_md,
    constraints_md: p.constraints_md,
    examples: p.tests
      .filter((t) => t.visibility === "public")
      .map((t) => ({
        test_index: t.test_index,
        input_json: t.input_json,
        expected_display: JSON.stringify(t.expected_json)
      })),
    signatures: p.signatures,
    template_by_language: p.template_by_language
  }));
}
