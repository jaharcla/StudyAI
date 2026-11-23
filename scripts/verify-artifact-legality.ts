import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArtifactPackage } from "../src/artifacts/package.js";
import { stableJson } from "../src/canvas/stable-json.js";
import { DEFAULT_VIEWPORT } from "../src/canvas/ai/teaching-scene.js";
import { compilePackage } from "../server/artifact-intelligence/service.js";

const GENERATIONS = "docs/verification/artifact-generations.json";
const OUTPUT = "docs/verification/artifact-legality-repeats.json";
const REPEATS = 5;

type Generation = {
  id: string;
  status: string;
  retrievedRefs: string[];
  retrieved: Array<{ ref: string; text: string }>;
  package?: unknown;
};

const generations = (JSON.parse(readFileSync(GENERATIONS, "utf8")) as { generations: Generation[] }).generations;
const results: Array<Record<string, unknown>> = [];
let failed = false;

for (const generation of generations) {
  if (generation.status !== "validated" || !generation.package) {
    results.push({ id: generation.id, status: "exempt", reason: generation.status === "insufficient-evidence" ? "No package was generated; honesty is scored instead." : "No validated package to re-check." });
    continue;
  }
  const signatures: string[] = [];
  const failures: string[] = [];
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    try {
      const pkg = parseArtifactPackage(generation.package, generation.retrievedRefs);
      const compiled = compilePackage(pkg, {
        courseId: pkg.courseId,
        lessonId: pkg.lessonId,
        boardId: "legality-check-board",
        occupancy: [],
        viewport: DEFAULT_VIEWPORT,
        anchors: new Map(),
        retrievedRefs: generation.retrievedRefs,
        retrievedChunks: generation.retrieved,
      });
      if (!compiled.report.ok) failures.push(`repeat ${repeat + 1}: ${compiled.report.problems.map((problem) => `${problem.validator}: ${problem.message}`).join("; ")}`);
      // Object ids are minted per compile; compare structure with ids replaced by stable positions.
      const objects = (compiled.canvas?.objects ?? []).map((object, index) => ({ ...object, id: `obj-${index}` }));
      signatures.push(stableJson(objects));
    } catch (error) {
      failures.push(`repeat ${repeat + 1}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  const stable = new Set(signatures).size === 1;
  if (!stable) failures.push("compiled objects differed across repeats");
  if (failures.length) failed = true;
  results.push({ id: generation.id, repeats: REPEATS, stable, failures, status: failures.length ? "failed" : "passed" });
}

writeFileSync(OUTPUT, JSON.stringify({ repeatsRequired: REPEATS, results }, null, 2) + "\n");
console.log(`Legality repeats: ${results.filter((result) => result.status === "passed").length} passed, ${results.filter((result) => result.status === "failed").length} failed, ${results.filter((result) => result.status === "exempt").length} exempt. Report: ${OUTPUT}`);
if (failed) process.exitCode = 1;
