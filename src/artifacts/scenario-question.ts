/**
 * Scenario-first question rules adapted from BloomAssessmentItemGeneration (MIT, BEA 2026):
 * https://github.com/LyleW473/BloomAssessmentItemGeneration
 *
 * The upstream method is: generate a neutral factual scenario with concrete values first,
 * then derive an Application-level question from it, with critique/refine verification.
 * Our deterministic checks enforce the parts that caused the four failed cycles: a renamed
 * variable is not a transfer, and an answer copied from the explanation is not a question.
 */

const APPLICATION_VERB = /\b(compute|calculate|determine|predict|apply|use|solve|construct|show|demonstrate|transfer|extend|derive|find)\b/i;
const NUMBERS = /-?\d+(?:\.\d+)?/g;

export type ApplicationQuestionInput = {
  scenario?: string;
  prompt: string;
  answer?: string;
  explanationText?: string;
};

const tokens = (text: string): Set<string> => new Set(
  text.toLowerCase().replace(/[^a-z0-9\s.]/g, " ").split(/\s+/).filter((word) => word.length > 2),
);

function overlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

/** Deterministic eligibility check before a generated question is accepted. */
export function checkApplicationQuestion(input: ApplicationQuestionInput): string[] {
  const problems: string[] = [];
  const scenario = input.scenario?.trim() ?? "";
  const answer = input.answer?.trim() ?? "";
  if (scenario.length < 40) problems.push("A transfer question needs a scenario of at least 40 characters.");

  const values = scenario.match(NUMBERS) ?? [];
  if (scenario && values.length < 2) problems.push("The scenario needs at least two concrete values to support an application question.");
  if (!APPLICATION_VERB.test(input.prompt)) problems.push("The question must ask the student to apply, compute, predict or determine something.");
  if (scenario && values.length && !values.some((value) => input.prompt.includes(value) || answer.includes(value))) {
    problems.push("The question or answer must use at least one value from the changed scenario.");
  }
  if (answer && input.explanationText && input.explanationText.toLowerCase().includes(answer.toLowerCase())) {
    problems.push("The answer is copied from the explanation rather than derived from the scenario.");
  }
  if (scenario && input.explanationText && overlap(tokens(scenario), tokens(input.explanationText)) > 0.75) {
    problems.push("The scenario paraphrases the explanation; it is not a changed condition.");
  }
  return problems;
}
