/** Neutral, non-course script so every engine reads identical words. */
export const LISTEN_PASSAGE =
  "Before you review, take a moment to write down the question you are trying to answer. " +
  "Read the shortest passage that could answer it, then close the page and say the idea back in your own words. " +
  "If you cannot say it clearly yet, that is useful information: go back to the same passage once more. " +
  "When you can explain it without looking, move to the next question and repeat the same short cycle.";

export function listenSheet(candidates: readonly string[]): string {
  const rows = candidates.map((name, index) => `| ${index + 1} | ${name} |  |  |`);
  return [
    "# Voice naturalness listen sheet (blind)",
    "",
    "Play one clip per engine in a shuffled order. Do not reveal the engine name while scoring.",
    "Score 1–5 for naturalness, then write one sentence of reasoning. No UTMOS or other proxy replaces this listen test.",
    "",
    "Fixed passage (neutral wording, no course facts):",
    "",
    `> ${LISTEN_PASSAGE}`,
    "",
    "| Clip | Engine (reveal after scoring) | Score 1–5 | One-sentence reason |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
