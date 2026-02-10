import { afterAll } from "vitest";
import { pool } from "../src/db/pool";
import { setGenerateFollowUpQuestionImpl } from "../src/services/interviewer/followUp";

// Default mock so interviewer follow-up never calls OpenAI in tests
setGenerateFollowUpQuestionImpl(async () => ({ text: "Could you elaborate on that?" }));

afterAll(async () => {
  await pool.end();
});
