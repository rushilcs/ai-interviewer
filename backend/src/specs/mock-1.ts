/** Interview spec mle-v1. Source of truth: docs/interviews/mock-1.md */

export type FollowUpIntent = {
  name: string;
  description: string;
};

export type SectionSpec = {
  id: string;
  name: string;
  objective: string;
  initial_prompt: string;
  allowed_follow_up_intents: FollowUpIntent[];
  disallowed: string[];
};

export type Mock1Spec = {
  schema_version: string;
  problem_context: string;
  global_rules: string[];
  sections: SectionSpec[];
};

const PROBLEM_CONTEXT = `### Context
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
The focus is on reasoning, tradeoffs, and clarity.`;

const GLOBAL_RULES = [
  "Ask **one** question at a time",
  "Every follow-up must map to an allowed intent",
  "Never provide answers, hints, or validation",
  "Keep questions concise and neutral",
  "The interviewer's role is to probe, not teach"
];

const SECTIONS: SectionSpec[] = [
  {
    id: "section_1",
    name: "Problem Framing & Success Definition",
    objective: "Evaluate the candidate's ability to: clarify ambiguous problems; define success in measurable terms; align ML metrics with product goals.",
    initial_prompt: "Restate the problem in your own words. What is the system trying to achieve?",
    allowed_follow_up_intents: [
      { name: "Clarification", description: "Ask the candidate to make an assumption explicit; ask them to narrow scope or define an unclear term." },
      { name: "Metric Justification", description: "Ask why a proposed metric is appropriate; ask what the metric fails to capture." },
      { name: "Tradeoff Exploration", description: "Ask how optimizing one metric might harm another; ask about short-term vs long-term objectives." },
      { name: "Edge Case Probe", description: "Ask how success would be measured in an unusual or failure scenario." }
    ],
    disallowed: [
      "Do not suggest specific metrics unprompted",
      "Do not teach or explain metrics",
      "Do not rephrase the candidate's answer for them",
      "Do not ask multiple questions at once"
    ]
  },
  {
    id: "section_2",
    name: "Modeling Strategy & Tradeoffs",
    objective: "Evaluate the candidate's ability to: choose reasonable model classes; justify modeling decisions; reason about constraints.",
    initial_prompt: "What type of modeling approach would you start with, and why?",
    allowed_follow_up_intents: [
      { name: "Model Justification", description: "Ask why the chosen model fits the problem." },
      { name: "Alternative Comparison", description: "Ask what alternatives were considered and rejected." },
      { name: "Constraint Sensitivity", description: "Ask how latency, data size, or interpretability affects the choice." },
      { name: "Feature Reasoning", description: "Ask what kinds of features would matter most." }
    ],
    disallowed: [
      "Do not recommend specific models",
      "Do not correct the candidate",
      "Do not introduce new problem requirements"
    ]
  },
  {
    id: "section_3",
    name: "System Design & Failure Modes",
    objective: "Evaluate the candidate's ability to: reason about ML systems in production; identify risks and failure modes; think about validation and rollout.",
    initial_prompt: "At a high level, how would you structure training and inference for this system?",
    allowed_follow_up_intents: [
      { name: "Failure Mode Probe", description: "Ask what could go wrong after deployment." },
      { name: "Monitoring & Detection", description: "Ask how issues would be detected." },
      { name: "Safety & Rollout", description: "Ask how changes would be tested safely." },
      { name: "Scalability", description: "Ask what breaks at large scale." }
    ],
    disallowed: [
      "Do not ask for code",
      "Do not give examples of failures",
      "Do not lead the candidate toward \"correct\" answers"
    ]
  },
  {
    id: "section_coding",
    name: "Coding",
    objective: "Evaluate the candidate's ability to implement a small, well-scoped piece of the ranking pipeline (e.g. a metric or helper).",
    initial_prompt: "Implement a function that computes DCG (Discounted Cumulative Gain) for a list of relevance scores. Assume the input is an array of numbers (relevance per position, 0-indexed). Use the formula: DCG = sum(rel_i / log2(i+2)) for i from 0. Return a single number. Use Python or JavaScript. Keep it concise.",
    allowed_follow_up_intents: [],
    disallowed: []
  },
  {
    id: "section_4",
    name: "Reflection & Judgment",
    objective: "Evaluate the candidate's: self-awareness; ability to reflect on assumptions; prioritization instincts.",
    initial_prompt: "If you had more time or resources, what would you improve next?",
    allowed_follow_up_intents: [
      { name: "Assumption Challenge", description: "Ask which assumption is riskiest." },
      { name: "Impact Prioritization", description: "Ask why that improvement matters most." }
    ],
    disallowed: [
      "Do not summarize the candidate's performance",
      "Do not provide feedback",
      "Do not suggest improvements yourself"
    ]
  }
];

let cached: Mock1Spec | null = null;

export function getMock1Spec(): Mock1Spec {
  if (cached) return cached;
  cached = {
    schema_version: "mle-v1",
    problem_context: PROBLEM_CONTEXT,
    global_rules: GLOBAL_RULES,
    sections: SECTIONS
  };
  return cached;
}

export function getSectionSpec(sectionId: string): SectionSpec | undefined {
  return getMock1Spec().sections.find((s) => s.id === sectionId);
}

export function getInitialPromptForSection(sectionId: string): string | undefined {
  return getSectionSpec(sectionId)?.initial_prompt;
}
