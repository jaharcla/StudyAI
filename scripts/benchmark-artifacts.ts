import { readFileSync } from "node:fs";
import { SCENARIOS, WEIGHTS, scoreGeneration, type Dimension, type HumanLabels } from "../src/artifacts/benchmark";

type Baseline = {
  reviewStatus: string;
  weights: Record<string, number>;
  scenarios: Array<{ name: string; labels: HumanLabels }>;
};

const baseline = JSON.parse(readFileSync("docs/verification/artifact-quality-baseline.json", "utf8")) as Baseline;

let incomplete = false;
console.log(`Artifact quality benchmark — reviewStatus: ${baseline.reviewStatus}`);
for (const scenario of baseline.scenarios) {
  const result = scoreGeneration(scenario.labels);
  if (result.completeness === "pending-human-review") incomplete = true;
  const detail = (Object.keys(WEIGHTS) as Dimension[])
    .map((dimension) => `${dimension}:${scenario.labels[dimension] ?? "-"}`)
    .join("  ");
  const overall = result.overall === undefined ? "no overall (human review pending)" : result.overall.toFixed(3);
  console.log(`${scenario.name.padEnd(32)} ${detail}  overall: ${overall}`);
}
if (incomplete) console.log("INCOMPLETE — human blind review required; no overall quality score is claimed.");
else if (!SCENARIOS.every((name) => baseline.scenarios.some((scenario) => scenario.name === name))) {
  console.log("INCOMPLETE — baseline does not cover all four scenarios.");
}
