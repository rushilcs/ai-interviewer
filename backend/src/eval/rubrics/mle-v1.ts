/**
 * Evaluation rubric config for mle-v1 interview.
 * Base rubrics apply to the initial question only; follow-up scoring applies only to asked follow-ups.
 */

import type { RubricConfig } from "./types";

const FOLLOWUP_SCORING_RULES = `Score the candidate's answers to each follow-up that was actually asked.
- Score higher when the candidate answers the asked follow-up directly, addresses the requested dimensions, and adds correct, relevant detail.
- Score lower when the candidate dodges, answers a different question, or stays vague.
- Do NOT penalize for missing topics that were never asked.
- Reward relevant specificity, not length. Concise but complete answers can score highly.
- Penalize irrelevant filler and contradictions.`;

export const MLE_V1_RUBRIC: RubricConfig = {
  schemaVersion: "mle-v1",
  sections: {
    section_1: {
      score_range: [0, 1],
      base_rubric_prompt: `Evaluate the candidate's response to the initial question: "Restate the problem in your own words. What is the system trying to achieve?"
- Great (high score): Clearly restates the goal; defines what "achieve" means in measurable terms when appropriate; is faithful to the prompt.
- Weak (low score): Vague or incorrect restatement.`,
      followup_scoring_rules: FOLLOWUP_SCORING_RULES,
      anchors: {
        "0.2": "Vague or incorrect restatement; does not identify the system goal.",
        "0.6": "Restates the problem with some clarity; may miss measurable success criteria or constraints.",
        "0.9": "Clear restatement; measurable success criteria; faithful to the prompt."
      }
    },
    section_2: {
      score_range: [0, 1],
      base_rubric_prompt: `Evaluate the candidate's response to the initial question: "What type of modeling approach would you start with, and why?"
- Great (high score): Proposes a reasonable starting modeling approach and explains why it fits the problem.
- Weak (low score): Model name-dropping without justification.`,
      followup_scoring_rules: FOLLOWUP_SCORING_RULES,
      anchors: {
        "0.2": "No clear model choice or unjustified name-dropping.",
        "0.6": "Reasonable approach with some justification; may lack depth on tradeoffs.",
        "0.9": "Clear approach with strong justification; considers problem fit."
      }
    },
    section_3: {
      score_range: [0, 1],
      base_rubric_prompt: `Evaluate the candidate's response to the initial question: "At a high level, how would you structure training and inference for this system?"
- Great (high score): Explains training vs inference structure at a high level; faithful to the prompt.
- Weak (low score): Hand-wavy; no clear training/inference separation.`,
      followup_scoring_rules: FOLLOWUP_SCORING_RULES,
      anchors: {
        "0.2": "No clear structure; hand-wavy or off-topic.",
        "0.6": "Some training/inference separation; may lack detail on how they differ.",
        "0.9": "Clear high-level structure; training vs inference separation explained."
      }
    },
    section_4: {
      score_range: [0, 1],
      base_rubric_prompt: `Evaluate the candidate's response to the initial question: "If you had more time or resources, what would you improve next?"
- Great (high score): Concrete improvements and why they matter.
- Weak (low score): Generic "improve model" without specifics.`,
      followup_scoring_rules: FOLLOWUP_SCORING_RULES,
      anchors: {
        "0.2": "Generic or no concrete improvements.",
        "0.6": "Some concrete improvements; rationale may be thin.",
        "0.9": "Concrete, prioritized improvements with clear rationale."
      }
    }
  }
};
