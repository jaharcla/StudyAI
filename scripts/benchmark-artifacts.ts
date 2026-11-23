import { readFileSync } from "node:fs";
import { SCENARIOS, WEIGHTS, scoreGeneration, evaluateQualityGate, gateScenarios, type Dimension, type HumanLabels, type QualityGate } from "../src/artifacts/benchmark";

type Baseline = {
  reviewStatus: string;
  weights: Record<string, number>;
  gate?: QualityGate;
  scenarios: Array<{ name: string; labels: HumanLabels; heldOut?: boolean }>;
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
const gateSet = gateScenarios(baseline.scenarios);
const gateReady = gateSet.every((scenario) => typeof scenario.labels.pedagogy === "number");
if (baseline.gate && gateReady) {
  const gate = evaluateQualityGate(gateSet.map((scenario) => ({ name: scenario.name, pedagogy: scenario.labels.pedagogy ?? 0 })), baseline.gate);
  console.log(`Gate: ${gate.eligible ? "QUALIFIED" : "NOT QUALIFIED"}${gate.reasons.length ? ` — ${gate.reasons.join("; ")}` : ""}`);
} else if (baseline.gate) {
  console.log("Gate: not evaluated — gate scenario labels pending.");
}
if (incomplete) console.log("INCOMPLETE — refusal case has no numeric labels under its registered rubric; no overall quality score is claimed for it.");
else if (!SCENARIOS.every((name) => baseline.scenarios.some((scenario) => scenario.name === name))) {
  console.log("INCOMPLETE — baseline does not cover all four scenarios.");
}
