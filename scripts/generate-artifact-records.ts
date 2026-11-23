import "dotenv/config";
import { writeFileSync } from "node:fs";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { parseArtifactPackage } from "../src/artifacts/package.js";
import { getTutorProviderSettings } from "../server/tutor-provider.js";
import { createTutorChatModel } from "../server/tutor-chat-model.js";

const CYCLE = process.env.ARTIFACT_CYCLE ?? "1";
const SUFFIX = CYCLE === "1" ? "" : `-cycle${CYCLE}`;
const OUTPUT = `docs/verification/artifact-generations${SUFFIX}.json`;
const META = `docs/verification/artifact-generation-meta${SUFFIX}.json`;
const SHEET = `docs/verification/artifact-blind-review-sheet${SUFFIX}.md`;

const REF = "studyai://document/module-1/text/4?chunk=0";
const TORQUE_REF = "studyai://document/module-2/text/9?chunk=1";

type Scenario = {
  id: string;
  name: string;
  prompt: string;
  retrieved: Array<{ ref: string; text: string }>;
  topicTerms?: string[];
  requireCitations?: boolean;
  forbidPlaceholders?: boolean;
  missingSource?: boolean;
};

const scenarios: Scenario[] = [
  {
    id: "documented-request",
    name: "documented request",
    prompt: "From the retrieved lecture note, make a study artifact that explains friction on an incline and includes one question. Keep it grounded in the note.",
    retrieved: [{ ref: REF, text: "Friction opposes the motion of a block sliding down an incline. The normal force acts perpendicular to the surface and has magnitude mg cos(theta)." }],
    topicTerms: ["friction"],
    requireCitations: true,
    forbidPlaceholders: true,
  },
  {
    id: "ambiguous-request",
    name: "ambiguous request",
    prompt: "Make me something useful from this lesson on forces. Use your judgement about what to include.",
    retrieved: [{ ref: REF, text: "Forces on a block include gravity, the normal force, and friction. The diagram should show their directions on an incline." }],
    requireCitations: true,
    forbidPlaceholders: true,
  },
  {
    id: "multi-component-torque",
    name: "multi-component torque package",
    prompt: "Build a package about torque with a diagram, an explanation, a question, a summary, and a short interactive exercise.",
    retrieved: [{ ref: TORQUE_REF, text: "Torque is the product of the lever arm and the applied force perpendicular to it. A beam in equilibrium has balanced clockwise and anticlockwise torques." }],
    topicTerms: ["torque"],
    requireCitations: true,
    forbidPlaceholders: true,
  },
  {
    id: "insufficient-source",
    name: "insufficient source",
    prompt: "What topics did my professor say would be on the final exam? Make a study artifact if you can.",
    retrieved: [],
    missingSource: true,
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

Rules:
- Every sourceRef must be exactly one of the retrieved refs given in the user message. When evidence refs are supplied, EVERY component must carry at least one of them in sourceRefs. Never leave a component's sourceRefs empty when refs are available.
- Component ids must be unique and relations must point to existing ids without cycles.
- Every diagram force's "components" must be exactly two finite numbers, for example [0,-9.8], never one or three. Gravity on a level surface is (0,-9.8); the normal force is (0,+9.8) on a level surface and perpendicular to the surface on an incline; friction is parallel to the surface and opposes sliding. Never point friction straight down or use placeholder numbers. Each force "label" must be at most 60 characters; use short labels such as "gravity", "normal", "friction".
- Never write placeholder prose such as "the diagram should show" or "placeholder"; write the actual content the component claims to provide.
- Questions must test the topic named in the scenario, not an adjacent concept. The question prompt and answer must both be about that topic.
- If you include an interactive-exercise, its prompt must ask for exactly the quantity its config computes; a graph-interpretation exercise must ask for a value read from the line at atX, not a torque calculation.
- For an insufficient-source request, return an explanation whose text explicitly says the course material is not available, names what is missing, and offers a concrete next step such as uploading the announcement or outline. Do not echo the question as the whole answer, and do not invent course facts. Use empty sourceRefs.`;

function balanceTruncatedJson(source: string): string {
  let result = source;
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (const char of source) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") stack.pop();
  }
  if (inString) result += '"';
  while (stack.length) result += stack.pop() === "{" ? "}" : "]";
  return result;
}

function repairMidKey(source: string): string {
  const quote = source.lastIndexOf('"');
  if (quote < 0) return balanceTruncatedJson(source);
  const cut = Math.max(source.lastIndexOf(",", quote), source.lastIndexOf("{", quote), source.lastIndexOf("[", quote));
  const base = source.slice(0, cut).replace(/,\s*$/, "");
  return balanceTruncatedJson(base);
}

function parseJson(text: string): unknown {
  const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const positions = (char: string): number[] => [...fenced].flatMap((value, index) => value === char ? [index] : []);
  const starts = positions("{");
  const ends = positions("}");
  const attempts: string[] = [];
  for (const start of starts) {
    for (let index = ends.length - 1; index >= 0; index -= 1) {
      const end = ends[index] ?? 0;
      if (end > start) attempts.push(fenced.slice(start, end + 1));
    }
    attempts.push(balanceTruncatedJson(fenced.slice(start)));
    attempts.push(repairMidKey(fenced.slice(start)));
  }
  // Reasoning models often quote a tiny example object before the real package.
  // Prefer the largest component-bearing candidate so the example cannot win.
  const ranked = attempts
    .filter((attempt) => attempt.includes('"components"'))
    .sort((left, right) => right.length - left.length);
  for (const attempt of ranked) {
    const repaired = attempt.replace(/}\s*{/g, "},{").replace(/\]\s*\[/g, "],[");
    try { return JSON.parse(attempt) as unknown; } catch { /* try next candidate */ }
    try { return JSON.parse(repaired) as unknown; } catch { /* try next candidate */ }
  }
  throw new Error("Model output contained no parseable JSON object.");
}

type ComposedComponent = { kind?: string; sourceRefs?: string[]; prompt?: string; text?: string; front?: string; title?: string };

/** Composer-level constraints from the first cycle's review, checked on the parsed object before scoring. */
function assertComposerConstraints(value: unknown, scenario: Scenario): void {
  const text = JSON.stringify(value).toLowerCase();
  const problems: string[] = [];
  const object = value && typeof value === "object" ? value as { components?: ComposedComponent[]; objective?: string; reason?: string } : {};
  const components = object.components ?? [];

  if (scenario.missingSource) {
    const acknowledgement = `${object.objective ?? ""} ${object.reason ?? ""} ${components.map((component) => component.text ?? "").join(" ")}`.toLowerCase();
    if (!/not (?:available|supplied|provided)|could not find|cannot find|don't have|no relevant/.test(acknowledgement)) problems.push("Acknowledgement does not say the course material is missing.");
    if (!/upload|provide|share|send/.test(acknowledgement)) problems.push("Acknowledgement offers no concrete next step.");
  }
  if (scenario.requireCitations && components.some((component) => !component.sourceRefs?.length)) {
    problems.push("At least one component has empty sourceRefs despite supplied evidence.");
  }
  const primaries = components.filter((component) => ["question", "worked-example", "flashcard"].includes(component.kind ?? ""));
  if (primaries.length > 1) problems.push("Only one primary Canvas item (question, worked example or deck) may be composed in a single revision.");
  const figures = components.filter((component) => ["diagram", "graph", "equation", "mind-map"].includes(component.kind ?? ""));
  if (figures.length > 1) problems.push("Only one figure (diagram, graph, equation or mind map) may be composed in a single revision.");
  const longLabels = components.flatMap((component) => (component as ComposedComponent & { forces?: Array<{ label?: string }> }).forces ?? [])
    .filter((force) => (force.label ?? "").length > 60);
  if (longLabels.length) problems.push(`Shorten diagram force labels to at most 60 characters (${longLabels.length} too long).`);
  if (scenario.forbidPlaceholders && /should show|placeholder|todo/i.test(text)) problems.push("Placeholder prose found.");
  for (const term of scenario.topicTerms ?? []) {
    const mentionsTopic = components.some((component) =>
      (component.kind === "question" && component.prompt?.toLowerCase().includes(term.toLowerCase()))
      || (component.kind !== "question" && [component.prompt, component.text, component.front, component.title].some((field) => field?.toLowerCase().includes(term.toLowerCase()))));
    if (!mentionsTopic) problems.push(`No component mentions the required topic '${term}'.`);
  }
  if (problems.length) throw new Error(problems.join(" "));
}

const settings = getTutorProviderSettings();
const provider = process.env.ARTIFACT_PROVIDER === "opencode-go" ? "opencode-go" as const : "ollama" as const;
const modelName = process.env.ARTIFACT_MODEL || (provider === "ollama" ? process.env.OLLAMA_MODEL || "qwen3:latest" : "hy4-flash-free");
const model = createTutorChatModel(provider, modelName, settings);

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
  let lastRawText = "";
  let parsed: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const correction = attempt
        ? `\n\nCorrection: ${lastError}. Return ONLY one JSON object. Begin your response with { and end with }. No prose, no markdown fences, no explanation.`
        : "";
      const response = await model.invoke([new SystemMessage(SYSTEM), new HumanMessage(userText + correction)]);
      const contentText = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const extras = response.additional_kwargs as Record<string, unknown> | undefined;
      const reasoning = typeof extras?.reasoning_content === "string" ? extras.reasoning_content : "";
      const text = contentText.trim() ? contentText : reasoning;
      lastRawText = text;
      parsed = parseJson(text);
      assertComposerConstraints(parsed, scenario);
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
        meta.push({ id: scenario.id, provider, model: modelName, attempts: attempt + 1 });
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
      meta.push({ id: scenario.id, provider, model: modelName, attempts: attempt + 1 });
      reviewLines.push(`## ${scenario.id}`, "", `**Request:** ${scenario.prompt}`, "", "**Generated package:**", "", "```json", JSON.stringify(pkg, null, 2), "```", "");
      console.log(`${scenario.id}: validated (${pkg.components.length} components, attempt ${attempt + 1})`);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Invalid package.";
      if (attempt === 1) {
        records.push({ id: scenario.id, scenario: scenario.name, status: "failed", error: lastError, rawOutput: String(lastRawText ?? "").slice(0, 4000) });
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
