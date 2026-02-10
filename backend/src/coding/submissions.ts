/**
 * Tracks which coding problems have been submitted per interview.
 * One submit per problem; used to lock code and allow "next section" without warning.
 */

const submittedByInterview = new Map<string, Set<string>>();

export function addSubmission(interviewId: string, problemId: string): void {
  let set = submittedByInterview.get(interviewId);
  if (!set) {
    set = new Set<string>();
    submittedByInterview.set(interviewId, set);
  }
  set.add(problemId);
}

export function hasSubmitted(interviewId: string, problemId: string): boolean {
  return submittedByInterview.get(interviewId)?.has(problemId) ?? false;
}

export function getSubmittedProblemIds(interviewId: string): string[] {
  const set = submittedByInterview.get(interviewId);
  return set ? Array.from(set) : [];
}
