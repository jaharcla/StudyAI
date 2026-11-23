import { readFileSync, writeFileSync } from "node:fs";

type Generation = {
  id: string;
  prompt: string;
  package?: unknown;
  status: string;
};

const GENERATIONS = "docs/verification/artifact-generations-cycle4.json";
const OUTPUT = "docs/verification/independent-pedagogy-review-generation-A.md";
const TARGET = "documented-request";

const generations = (JSON.parse(readFileSync(GENERATIONS, "utf8")) as { generations: Generation[] }).generations;
const generation = generations.find((item) => item.id === TARGET);
if (!generation?.package) throw new Error(`No scored package found for ${TARGET}.`);

const fence = String.fromCharCode(96).repeat(3);
const lines = [
  "# Independent pedagogy review — generation A",
  "",
  "Score pedagogy only, 0-5.",
  "",
  "Rubric: does the question require applying or transferring the idea to a new situation, rather than recalling or copying from the explanation? Consider whether the answer can be produced by restating the supplied text.",
  "",
  "## Student request",
  "",
  generation.prompt,
  "",
  "## Generated package",
  "",
  `${fence}json`,
  JSON.stringify(generation.package, null, 2),
  fence,
  "",
  "Pedagogy score: ___ / 5",
  "",
];
writeFileSync(OUTPUT, lines.join("\n"));
console.log(`Wrote ${OUTPUT}`);
