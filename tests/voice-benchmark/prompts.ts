import type { BenchmarkPrompt } from "./types.js";

/**
 * Fixed student questions for the live desktop voice tutor. The course prompts
 * are questions drawn from the topic of the user's real CHEM 121 Module 3 PDF
 * ("Multielectron Atoms and the Periodic Table"); they are not invented facts,
 * citations or answer keys. The harness supplies no course excerpts, so the
 * evidence contract deterministically reports "No course evidence".
 */
const COURSE_LABEL = "CHEM 121 Module 3 · course topic (no excerpts supplied)";

const courseQuestions: string[] = [
  "According to my course module, how do I write the ground-state electron configuration of a multielectron atom?",
  "What does the module say about the order in which orbitals are filled?",
  "How does my course material describe the difference between an atom and an ion configuration?",
  "What does the module say about noble-gas shorthand for electron configurations?",
  "Where does the periodic table come into assigning electron configurations in my course?",
  "What does my course say about valence electrons for the main-group elements?",
  "How does the module explain why some electron configurations are exceptions to the filling order?",
  "What does the course material say about interpreting an orbital diagram?",
  "How would I use my course notes to identify the number of unpaired electrons?",
  "What does the module say about the relationship between group number and valence electrons?",
  "According to my course, how do I check whether an electron configuration is for a cation or an anion?",
  "What does the course say about the connection between electron configuration and periodic trends?",
];

const refusalQuestions: string[] = [
  "What did my course say about the 2028 laboratory budget?",
  "According to my module, who won the chemistry department award last year?",
  "What does my course material say about the cafeteria menu?",
];

const interruptedQuestions: string[] = [
  "Explain the filling order for orbitals in my course and then keep going for a long time.",
  "Walk me through writing the configuration for an ion and keep giving examples.",
  "Describe orbital diagrams in detail and continue with every remaining element.",
];

export const PROMPTS: readonly BenchmarkPrompt[] = [
  ...courseQuestions.map((text, index) => ({
    id: `c${String(index + 1).padStart(2, "0")}`,
    kind: "course" as const,
    text,
    sourceLabel: COURSE_LABEL,
    expectsRefusal: false,
  })),
  ...refusalQuestions.map((text, index) => ({
    id: `r${String(index + 1).padStart(2, "0")}`,
    kind: "refusal" as const,
    text,
    sourceLabel: "No course evidence · out-of-scope question",
    expectsRefusal: true,
  })),
  ...interruptedQuestions.map((text, index) => ({
    id: `i${String(index + 1).padStart(2, "0")}`,
    kind: "interrupted" as const,
    text,
    sourceLabel: COURSE_LABEL,
    expectsRefusal: false,
  })),
];

export function promptsForKind(kind: BenchmarkPrompt["kind"]): BenchmarkPrompt[] {
  return PROMPTS.filter((prompt) => prompt.kind === kind);
}
