import "dotenv/config";
import { writeFileSync } from "node:fs";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { parseArtifactPackage } from "../src/artifacts/package.js";
import { getTutorProviderSettings } from "../server/tutor-provider.js";
import { createTutorChatModel } from "../server/tutor-chat-model.js";

const OUTPUT = "docs/verification/artifact-generations.json";
const META = "docs/verification/artifact-generation-meta.json";
const SHEET = "docs/verification/artifact-blind-review-sheet.md";

const REF = "studyai://document/module-1/text/4?chunk=0";
const TORQUE_REF = "studyai://document/module-2/text/9?chunk=1";

type Scenario = {
  id: string;
  name: string;
  prompt: string;
  retrieved: Array<{ ref: string; text: string }>;
};

const scenarios: Scenario[] = [
  {
    id: "documented-request",
    name: "documented request",
    prompt: "From the retrieved lecture note, make a study artifact that explains friction on an incline and includes one question. Keep it grounded in the note.",
    retrieved: [{ ref: REF, text: "Friction opposes the motion of a block sliding down an incline. The normal force acts perpendicular to the surface and has magnitude mg cos(theta)." }],
  },
  {
    id: "ambiguous-request",
    name: "ambiguous request",
    prompt: "Make me something useful from this lesson on forces. Use your judgement about what to include.",
    retrieved: [{ ref: REF, text: "Forces on a block include gravity, the normal force, and friction. The diagram should show their directions on an incline." }],
  },
  {
    id: "multi-component-torque",
    name: "multi-component torque package",
    prompt: "Build a package about torque with a diagram, an explanation, a question, a summary, and a short interactive exercise.",
    retrieved: [{ ref: TORQUE_REF, text: "Torque is the product of the lever arm and the applied force perpendicular to it. A beam in equilibrium has balanced clockwise and anticlockwise torques." }],
  },
  {
    id: "insufficient-source",
    name: "insufficient source",
    prompt: "What topics did my professor say would be on the final exam? Make a study artifact if you can.",
    retrieved: [],
  },
];

const SYSTEM = `You produce one artifact package as JSON. Output ONLY a JSON object, no markdown fences and no prose.

Shape:
{"schemaVersion":1,"id":"string","objective":"string","courseId":"chem-120","lessonId":"lesson-03",
 "components":[...],"relations":[{"from":"id","to":"id","relation":"explains"}],
 "provenance":{},"acceptance":{"decision":"pending"}}

Allowed component kinds and required fields:
- explanation: {"id","kind":"explanation","sourceRefs":[],"text":"...","concepts":[]}
- worked-example: {"id","kind":"worked-example","sourceRefs":[],"prompt":"...","steps":["..."],"answer":"..."}
- diagram: {"id","kind":"diagram","sourceRefs":[],"title":"...","forces":[{"label":"...","components":[x,y]}]}
- graph: {"id","kind":"graph","sourceRefs":[],"expression":"x","xRange":[a,b]}
- question: {"id","kind":"question","sourceRefs":[],"prompt":"...","answer":"..."}
- flashcard: {"id","kind":"flashcard","sourceRefs":[],"front":"...","back":"..."}
- mind-map: {"id","kind":"mind-map","sourceRefs":[],"title":"...","nodes":[{"id":"n","label":"..."}],"edges":[]}
- interactive-exercise: {"id","kind":"interactive-exercise","sourceRefs":[],"prompt":"...","exercise":{"mode":"graph-interpretation","slope":2,"intercept":0,"xRange":[-1,1],"atX":1}}
- summary: {"id","kind":"summary","sourceRefs":[],"title":"...","sections":[{"heading":"...","body":"..."}]}

Rules: every sourceRef must be exactly one of the retrieved refs given in the user message. Use an empty array when no refs are supplied. Component ids must be unique and relations must point to existing ids without cycles. Every diagram force's "components" must be exactly two finite numbers, for example [0,-9.8], never one or three. A graph xRange must be exactly two numbers with the second greater than the first. For an insufficient-source request, acknowledge the gap in text rather than inventing course facts, and use empty sourceRefs.`;

function parseJson(text: string): unknown {
  const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model output contained no JSON object.");
  return JSON.parse(fenced.slice(start, end + 1)) as unknown;
}

const settings = getTutorProviderSettings();
const modelName = process.env.OLLAMA_MODEL || "qwen3:latest";
const model = createTutorChatModel("ollama", modelName, settings);

const records: Array<Record<string, unknown>> = [];
const meta: Array<Record<string, unknown>> = [];
const reviewLines = [
  "# Artifact quality blind review sheet",
  "",
  "Score each generation 0–5 on six dimensions. Model identity and provider are recorded separately, not shown here.",
  "Keep disagreements instead of forcing consensus.",
  "",
  "| Dimension | Weight | Score 0–5 |",
  "|---|---:|---:|",
  "| Intent fidelity | 20 | |",
  "| Factual accuracy | 25 | |",
  "| Course grounding | 20 | |",
  "| Pedagogy | 20 | |",
  "| Visual quality | 10 | |",
  "| Interaction quality | 5 | |",
  "",
];

for (const scenario of scenarios) {
  const userText = `Scenario: ${scenario.name}\nRequest: ${scenario.prompt}\nRetrieved evidence (ref and text):\n${scenario.retrieved.map((item) => `${item.ref} :: ${item.text}`).join("\n") || "(none supplied)"}`;
  let lastError = "";
  let parsed: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await model.invoke([new SystemMessage(SYSTEM), new HumanMessage(userText + (attempt ? `\n\nCorrection: ${lastError}` : ""))]);
      const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      parsed = parseJson(text);
      const refs = scenario.retrieved.map((item) => item.ref);
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { components?: unknown }).components)
        && (parsed as { components: unknown[] }).components.length === 0) {
        const acknowledgement = String((parsed as { objective?: unknown; reason?: unknown }).objective
          ?? (parsed as { reason?: unknown }).reason ?? "No course material was supplied, so no artifact was invented.");
        records.push({
          id: scenario.id,
          scenario: scenario.name,
          prompt: scenario.prompt,
          retrievedRefs: refs,
          retrieved: scenario.retrieved,
          generatedAt: new Date().toISOString(),
          status: "insufficient-evidence",
          acknowledgement,
        });
        meta.push({ id: scenario.id, provider: "ollama", model: modelName, attempts: attempt + 1 });
        reviewLines.push(`## ${scenario.id}`, "", `**Request:** ${scenario.prompt}`, "", `**Acknowledgement:** ${acknowledgement}`, "");
        console.log(`${scenario.id}: insufficient-evidence (no artifact invented)`);
        break;
      }
      const pkg = parseArtifactPackage(parsed, refs);
      records.push({
        id: scenario.id,
        scenario: scenario.name,
        prompt: scenario.prompt,
        retrievedRefs: refs,
        retrieved: scenario.retrieved,
        package: pkg,
        generatedAt: new Date().toISOString(),
        status: "validated",
      });
      meta.push({ id: scenario.id, provider: "ollama", model: modelName, attempts: attempt + 1 });
      reviewLines.push(`## ${scenario.id}`, "", `**Request:** ${scenario.prompt}`, "", "**Generated package:**", "", "```json", JSON.stringify(pkg, null, 2), "```", "");
      console.log(`${scenario.id}: validated (${pkg.components.length} components, attempt ${attempt + 1})`);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Invalid package.";
      if (attempt === 1) {
        records.push({ id: scenario.id, scenario: scenario.name, status: "failed", error: lastError });
        meta.push({ id: scenario.id, provider: "ollama", model: modelName, attempts: 2 });
        reviewLines.push(`## ${scenario.id}`, "", `**Request:** ${scenario.prompt}`, "", `**Generation failed validation:** ${lastError}`, "");
        console.log(`${scenario.id}: FAILED — ${lastError}`);
      }
    }
  }
}

writeFileSync(OUTPUT, JSON.stringify({ generations: records }, null, 2) + "\n");
writeFileSync(META, JSON.stringify({ records: meta, note: "Not for reviewers. Reveal only after scores are committed." }, null, 2) + "\n");
writeFileSync(SHEET, reviewLines.join("\n"));
console.log(`Wrote ${OUTPUT}, ${META}, ${SHEET}`);
