import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { createTutorChatModel } from "../tutor-chat-model.js";
import { getTutorProviderSettings, tutorModelForProvider } from "../tutor-provider.js";
import { LearningService } from "../learning/service.js";
import { buildGrounding } from "./grounding.js";
import { initializeStudioSchema } from "./schema.js";
import {
  GenerateSchema, type AcceptanceDecision, type GenerateInput, type Grounding, type ImportInput,
  type StudioArtifact, type StudioContent, type StudioKind, type StudioSource,
} from "./contracts.js";
import { isCopyStyleQuestionPrompt } from "../learning/contracts.js";
import { sanitizeCourseText } from "../presentations/sanitize.js";

export const STUDIO_FALLBACK_NOTICE = "Built from your course material directly: the study assistant couldn't format a response this time, so this artifact uses cited excerpts. Try Generate again for a structured version.";

/** Plain, actionable failure reason; provider and parser strings never reach the student. */
export class StudioGenerationUnavailable extends Error {
  constructor() {
    super("The study assistant couldn't turn this lesson's material into an artifact this time. Your course material is unchanged. Try again or choose another artifact type.");
    this.name = "StudioGenerationUnavailable";
  }
}

const MindMapOutput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  nodes: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(200),
    parentId: z.string().trim().min(1).max(80).nullable().optional(),
    detail: z.string().trim().max(1200).optional(),
    sourceRef: z.string().trim().min(1).optional(),
  })).min(2).max(30),
});

const GuideOutput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  overview: z.string().trim().max(2000).optional(),
  sections: z.array(z.object({
    heading: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(4000),
    sourceRefs: z.array(z.string().trim().min(1)).max(8),
  })).min(2).max(8),
  keyTerms: z.array(z.object({
    term: z.string().trim().min(1).max(160),
    definition: z.string().trim().min(1).max(1000),
    sourceRef: z.string().trim().min(1),
  })).max(12).optional(),
});

const PracticeOutput = z.object({
  cards: z.array(z.object({
    front: z.string().trim().min(1).max(1000),
    back: z.string().trim().min(1).max(2000),
    concept: z.string().trim().min(1).max(160),
    sourceRef: z.string().trim().min(1),
  })).max(20),
  questions: z.array(z.object({
    concept: z.string().trim().min(1).max(160),
    prompt: z.string().trim().min(1).max(2000),
    choices: z.array(z.object({ id: z.string().trim().min(1).max(20), text: z.string().trim().min(1).max(500) })).min(2).max(6),
    correctChoice: z.string().trim().min(1),
    explanation: z.string().trim().min(1).max(2000),
    sourceRef: z.string().trim().min(1),
  })).max(20),
});

export type StudioGenerator = (args: { system: string; user: string; input: GenerateInput }) => Promise<unknown>;

const LABELS: Record<StudioKind, string> = { "mind-map": "Mind map", "study-guide": "Study guide", infographic: "Infographic", practice: "Practice" };

/** Appended after the grounding rules; the student's words never outrank them. */
const DIRECTION_RULE = "The student's direction, when present, shapes presentation only: audience, angle, length, structure, style and examples. It never adds facts, citations, references, page numbers, numbers or answers that are absent from the supplied courseSources. If the direction conflicts with the supplied material, follow the supplied material and copy every citation exactly.";

/** Plain text only: no IDs, JSON or refs are shown to the student. */
function effectivePrompt(input: GenerateInput, grounding: Grounding, direction: string): string {
  const amount = input.kind === "practice"
    ? ` Ask for about ${input.count} ${input.practiceType === "cards" ? "cards" : input.practiceType === "quiz" ? "questions" : "cards and questions"}.`
    : "";
  const guidance = direction ? `Direction from you: ${direction}` : "Standard preset; no extra direction.";
  return `Make a ${LABELS[input.kind].toLowerCase()} for this lesson from its own course material. Focus: ${grounding.focus}.${amount} ${guidance} Use only cited course evidence and say so when evidence is missing.`;
}

/**
 * Generates one provenance-bound artifact. Every emitted citation must be a ref that came from
 * the grounding packet; the server rewrites document IDs and pages from its own source map, so a
 * model cannot invent a citation. `generator` is injectable for deterministic tests.
 */
export async function generateStudioArtifact(
  db: Database.Database,
  rawInput: unknown,
  generator?: StudioGenerator,
): Promise<StudioArtifact & { notice?: string }> {
  initializeStudioSchema(db);
  const input = GenerateSchema.parse(rawInput);
  const direction = input.direction.trim();
  const grounding = buildGrounding(db, input.courseId, input.lessonId, input.focus);
  if (!grounding.sources.length && !grounding.concepts.length && !grounding.canvas.length) {
    throw new Error("No course sources, concepts or canvas knowledge are available for this lesson yet.");
  }

  const system = [
    "You are StudyAI Studio, a careful study assistant inside a local-first learning app.",
    "Return ONLY one JSON object. No prose, no Markdown fences.",
    "Use the supplied courseSources, concepts and canvasKnowledge as your only factual grounding.",
    "Every item MUST carry a sourceRef copied EXACTLY from a supplied courseSources ref (studyai://...).",
    "Never invent a ref, document ID, page number, or quote.",
    "Mind-map nodes may cite a supplied canvas: ref from canvasKnowledge; study guides and practice require studyai:// refs.",
    "Prefer the student's own concepts and canvas labels where they fit; do not overclaim.",
    "If the material is insufficient for the requested number of items, return fewer honest items.",
    "Keep wording concise and suitable for a university student. Use LaTeX in $...$ for equations.",
    "Practice questions must require understanding or application; never use 'According to the excerpt...' or similar giveaway phrasing, and the cited excerpt should help check the answer without containing the correct choice verbatim.",
    "Give every practice question exactly four distinct choices: one correct answer and three plausible distractors drawn from the same supplied course material. Never add a choice that is not supported by that material.",
    "If the supplied material supports fewer solid questions than requestedCount, return only the questions you can ground honestly; the app will tell the student the test is shorter.",
    ...(direction ? [DIRECTION_RULE] : []),
  ].join(" ");

  const user = JSON.stringify({
    task: input.kind,
    focus: grounding.focus,
    requestedCount: input.count,
    practiceType: input.practiceType,
    ...(direction ? { direction, directionScope: "presentation only; course evidence stays authoritative" } : {}),
    grounding: grounding.packet,
    outputShape: input.kind === "mind-map"
      ? '{"title":string,"nodes":[{"id":string,"label":string,"parentId":string|null,"detail"?:string,"sourceRef":string}]}'
      : input.kind === "study-guide"
        ? '{"title":string,"overview":string,"sections":[{"heading":string,"body":string,"sourceRefs":string[]}],"keyTerms":[{"term":string,"definition":string,"sourceRef":string}]}'
        : '{"cards":[{"front":string,"back":string,"concept":string,"sourceRef":string}],"questions":[{"concept":string,"prompt":string,"choices":[{"id":string,"text":string}],"correctChoice":string,"explanation":string,"sourceRef":string}]}',
  });

  const repairUser = `${user}\nYour previous response was not a single valid JSON object. Return only one JSON object with the requested keys, grounded only in the supplied courseSources.`;
  const canvasRefs = grounding.canvas.map((node) => node.ref);
  let content: StudioContent | undefined;
  for (let attempt = 0; attempt < 2 && !content; attempt++) {
    const raw = generator
      ? await generator({ system, user: attempt === 0 ? user : repairUser, input })
      : await invokeModelRaw(system, attempt === 0 ? user : repairUser);
    let parsed: unknown;
    try {
      parsed = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : parseJson(textContent(raw));
    } catch (error) {
      if (!(error instanceof ModelOutputFormatError)) throw error;
      continue;
    }
    content = validateContent(input.kind, parsed, grounding.sources, input.count, input.practiceType, canvasRefs);
  }
  const notice = content ? undefined : STUDIO_FALLBACK_NOTICE;
  if (!content) content = groundedFallback(input, grounding);
  if (input.kind === "practice" && input.practiceType !== "cards" && "questions" in content) {
    const produced = content.questions.length;
    if (produced > 0 && produced < input.count) {
      content.note = `This lesson's sources supported ${produced} grounded question${produced === 1 ? "" : "s"}, so the test is shorter than ${input.count}. Nothing was invented.`;
    }
  }
  const refs = [...new Set(collectRefs(content))];
  const title = "title" in content && content.title ? content.title : `${LABELS[input.kind]} · ${input.focus}`;

  const artifact: StudioArtifact = {
    id: randomUUID(),
    courseId: input.courseId,
    lessonId: input.lessonId,
    kind: input.kind,
    title: title.slice(0, 200),
    content,
    sourceRefs: refs,
    createdAt: new Date().toISOString(),
    acceptance: "pending",
    prompt: effectivePrompt(input, grounding, direction),
    ...(notice ? { notice } : {}),
  };
  saveStudioArtifact(db, artifact);
  return artifact;
}

/** Sole insert path into the shared studio artifact store; compilePackage results use it too. */
export function saveStudioArtifact(db: Database.Database, artifact: StudioArtifact): void {
  initializeStudioSchema(db);
  db.prepare("INSERT INTO studio_artifacts(id,course_id,lesson_id,kind,title,content,source_refs,created_at,acceptance,prompt) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(artifact.id, artifact.courseId, artifact.lessonId, artifact.kind, artifact.title, JSON.stringify(artifact.content), JSON.stringify(artifact.sourceRefs), artifact.createdAt, artifact.acceptance ?? "pending", artifact.prompt ?? "");
}

type StudioRow = Omit<StudioArtifact, "content" | "sourceRefs"> & { content: string; sourceRefs: string };

function hydrate(row: StudioRow): StudioArtifact {
  return { ...row, content: JSON.parse(row.content) as StudioContent, sourceRefs: JSON.parse(row.sourceRefs) as string[] };
}

export function getStudioArtifact(db: Database.Database, id: string, courseId: string, lessonId?: string): StudioArtifact | undefined {
  initializeStudioSchema(db);
  const row = db.prepare("SELECT id,course_id AS courseId,lesson_id AS lessonId,kind,title,content,source_refs AS sourceRefs,created_at AS createdAt,acceptance,prompt FROM studio_artifacts WHERE id=? AND course_id=?")
    .get(id, courseId) as StudioRow | undefined;
  if (!row || (lessonId && row.lessonId !== lessonId)) return undefined;
  return hydrate(row);
}

export function listStudioArtifacts(db: Database.Database, courseId: string, lessonId?: string, kind?: StudioKind): StudioArtifact[] {
  initializeStudioSchema(db);
  const rows = db.prepare("SELECT id,course_id AS courseId,lesson_id AS lessonId,kind,title,content,source_refs AS sourceRefs,created_at AS createdAt,acceptance,prompt FROM studio_artifacts WHERE course_id=? AND (?='' OR lesson_id=?) AND (?='' OR kind=?) ORDER BY created_at DESC LIMIT 20")
    .all(courseId, lessonId ?? "", lessonId ?? "", kind ?? "", kind ?? "") as StudioRow[];
  return rows.map(hydrate);
}

/** One bounded review transaction per artifact; no revision branch per format. */
export function setStudioArtifactAcceptance(
  db: Database.Database, id: string, decision: AcceptanceDecision,
): StudioArtifact | undefined {
  initializeStudioSchema(db);
  const result = db.prepare("UPDATE studio_artifacts SET acceptance=? WHERE id=?").run(decision, id);
  if (!result.changes) return undefined;
  const row = db.prepare("SELECT id,course_id AS courseId,lesson_id AS lessonId,kind,title,content,source_refs AS sourceRefs,created_at AS createdAt,acceptance,prompt FROM studio_artifacts WHERE id=?")
    .get(id) as StudioRow | undefined;
  return row ? hydrate(row) : undefined;
}

/** Imports accepted practice items through the existing learning authority (BKT + FSRS). */
export function importStudioArtifact(db: Database.Database, learning: LearningService, rawInput: unknown): { cardsAdded: number; questionsAdded: number; errors: string[] } {
  initializeStudioSchema(db);
  const input: ImportInput = z.object({
    artifactId: z.string().min(1),
    cards: z.array(z.number().int().nonnegative()).max(20).optional().default([]),
    questions: z.array(z.number().int().nonnegative()).max(20).optional().default([]),
  }).strict().parse(rawInput);

  const row = db.prepare("SELECT course_id AS courseId,lesson_id AS lessonId,kind,content FROM studio_artifacts WHERE id=?").get(input.artifactId) as { courseId: string; lessonId: string; kind: string; content: string } | undefined;
  if (!row) throw new Error("Studio artifact not found.");
  if (row.kind !== "practice") throw new Error("Only practice artifacts can be sent to the study deck.");
  const content = JSON.parse(row.content) as { cards?: Array<{ front: string; back: string; concept: string; sourceDocumentId: string; sourcePage: number | null; sourceExcerpt: string }>; questions?: Array<{ concept: string; prompt: string; choices: Array<{ id: string; text: string }>; correctChoice: string; explanation: string; sourceDocumentId: string; sourcePage: number | null; sourceExcerpt: string }> };

  let cardsAdded = 0;
  let questionsAdded = 0;
  const errors: string[] = [];
  for (const index of input.cards) {
    const card = content.cards?.[index];
    if (!card) continue;
    try {
      learning.registerCard({ courseId: row.courseId, lessonId: row.lessonId, conceptId: card.concept, front: card.front, back: card.back, sourceDocumentId: card.sourceDocumentId, sourcePage: card.sourcePage, sourceExcerpt: card.sourceExcerpt });
      cardsAdded += 1;
    } catch (error) {
      errors.push(`Card ${index + 1}: ${error instanceof Error ? error.message : "could not be added"}`);
    }
  }
  for (const index of input.questions) {
    const question = content.questions?.[index];
    if (!question) continue;
    try {
      learning.addReviewedQuestion({
        courseId: row.courseId, lessonId: row.lessonId, concept: question.concept, prompt: question.prompt,
        choices: question.choices, correctChoice: question.correctChoice, explanation: question.explanation,
        sourceDocumentId: question.sourceDocumentId, sourcePage: question.sourcePage, sourceExcerpt: question.sourceExcerpt,
      });
      questionsAdded += 1;
    } catch (error) {
      errors.push(`Question ${index + 1}: ${error instanceof Error ? error.message : "could not be added"}`);
    }
  }
  return { cardsAdded, questionsAdded, errors };
}

async function invokeModelRaw(system: string, user: string): Promise<unknown> {
  const settings = getTutorProviderSettings();
  const model = createTutorChatModel(settings.provider, tutorModelForProvider(settings.provider, settings), settings) as unknown as {
    invoke(messages: BaseMessage[]): Promise<{ content: unknown }>;
  };
  const response = await model.invoke([new SystemMessage(system), new HumanMessage(user)]);
  return response.content;
}

/** Deterministic, citation-bound content from retrieved course excerpts; no model, no new provider. */
function groundedFallback(input: GenerateInput, grounding: Grounding): StudioContent {
  const sources = grounding.sources.slice(0, Math.max(2, Math.min(input.count, 6)));
  if (!sources.length) throw new StudioGenerationUnavailable();
  if (input.kind === "study-guide") {
    return {
      title: `Study guide · ${grounding.focus}`,
      overview: sanitizeCourseText(sources[0].excerpt).slice(0, 400),
      sections: sources.map((source) => ({
        heading: source.title.slice(0, 120) || "Course evidence",
        body: sanitizeCourseText(source.excerpt).slice(0, 1000),
        sourceRefs: [source.ref],
      })),
      keyTerms: [],
    };
  }
  if (input.kind === "mind-map") {
    return {
      title: `Mind map · ${grounding.focus}`,
      nodes: [
        { id: "root", label: grounding.focus.slice(0, 120) || "Key concepts", parentId: null },
        ...sources.map((source, index) => ({
          id: `source-${index}`, label: source.title.slice(0, 120) || "Course evidence",
          parentId: "root", detail: sanitizeCourseText(source.excerpt).slice(0, 300), sourceRef: source.ref,
        })),
      ],
    };
  }
  return {
    cards: sources.map((source) => ({
      front: `What does your material say about ${source.title.slice(0, 100)}?`,
      back: sanitizeCourseText(source.excerpt).slice(0, 800),
      concept: source.title.slice(0, 160),
      ...sourceFields(source),
    })).slice(0, input.count),
    questions: [],
  };
}

/** Only output-shape failures are repairable; grounded-content validation failures still surface. */
export class ModelOutputFormatError extends Error {
  constructor() {
    super("The model did not return a JSON object.");
    this.name = "ModelOutputFormatError";
  }
}

export function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new ModelOutputFormatError();
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    throw new ModelOutputFormatError();
  }
}

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "text" in part) return String((part as { text: unknown }).text);
    return "";
  }).join("");
  return "";
}

function validateContent(kind: StudioKind, raw: unknown, sources: StudioSource[], count: number, practiceType: "cards" | "quiz" | "both", canvasRefs: string[] = []): StudioContent {
  if (kind === "mind-map") {
    const parsed = MindMapOutput.parse(raw);
    const allowed = (ref: string | undefined): ref is string => Boolean(ref && (sources.some((source) => source.ref === ref) || canvasRefs.includes(ref)));
    const byId = new Map<string, { id: string; label: string; parentId: string | null; detail?: string; sourceRef?: string }>();
    for (const node of parsed.nodes) {
      if (node.sourceRef && !allowed(node.sourceRef)) continue;
      if (!byId.has(node.id)) byId.set(node.id, { ...node, parentId: node.parentId ?? null, sourceRef: node.sourceRef && allowed(node.sourceRef) ? node.sourceRef : undefined });
    }
    const nodes = [...byId.values()];
    if (!nodes.some((node) => node.parentId === null)) nodes.unshift({ id: "root", label: "Key concepts", parentId: null });
    const roots = nodes.filter((node) => node.parentId === null);
    for (const node of nodes) if (node.parentId && !byId.has(node.parentId)) node.parentId = roots[0]?.id ?? null;
    if (nodes.length < 2) throw new Error("No grounded mind-map nodes were generated.");
    return { title: parsed.title ?? "Mind map", nodes };
  }

  if (kind === "study-guide") {
    const parsed = GuideOutput.parse(raw);
    const sections = parsed.sections.map((section) => ({ ...section, sourceRefs: [...new Set(section.sourceRefs.map((ref) => validRef(ref, sources)).filter((ref): ref is string => Boolean(ref)))] })).filter((section) => section.sourceRefs.length > 0);
    const keyTerms = (parsed.keyTerms ?? []).map((term) => ({ ...term, sourceRef: validRef(term.sourceRef, sources) })).filter((term): term is { term: string; definition: string; sourceRef: string } => Boolean(term.sourceRef));
    if (!sections.length) throw new Error("No grounded study-guide sections were generated.");
    return { title: parsed.title ?? "Study guide", overview: parsed.overview ?? "", sections, keyTerms };
  }

  const parsed = PracticeOutput.parse(raw);
  const cards = (practiceType === "quiz" ? [] : parsed.cards)
    .map((card) => withSource(card, sources)).filter((card): card is NonNullable<typeof card> => Boolean(card)).slice(0, count);
  const questions = (practiceType === "cards" ? [] : parsed.questions)
    .filter((question) => !isCopyStyleQuestionPrompt(question.prompt) && hasFourDistinctChoices(question.choices))
    .map((question) => {
      const source = sourceFor(question.sourceRef, sources);
      if (!source || !question.choices.some((choice) => choice.id === question.correctChoice)) return undefined;
      return { ...question, ...sourceFields(source) };
    }).filter((question): question is NonNullable<typeof question> => Boolean(question)).slice(0, count);
  if (!cards.length && !questions.length) throw new Error("No grounded practice items were generated.");
  return { cards, questions };
}

function hasFourDistinctChoices(choices: Array<{ id: string; text: string }>): boolean {
  if (choices.length !== 4) return false;
  return new Set(choices.map((choice) => choice.id)).size === 4
    && new Set(choices.map((choice) => choice.text.trim().toLowerCase())).size === 4;
}

function validRef(ref: string | undefined, sources: StudioSource[]): string | undefined {
  return ref && sources.some((source) => source.ref === ref) ? ref : undefined;
}

function sourceFor(ref: string, sources: StudioSource[]): StudioSource | undefined {
  return sources.find((source) => source.ref === ref);
}

function sourceFields(source: StudioSource) {
  return { sourceRef: source.ref, sourceDocumentId: source.documentId, sourcePage: source.sourcePage, sourceExcerpt: source.excerpt };
}

function withSource<T extends { sourceRef: string }>(item: T, sources: StudioSource[]): (T & ReturnType<typeof sourceFields>) | undefined {
  const source = sourceFor(item.sourceRef, sources);
  return source ? { ...item, ...sourceFields(source) } : undefined;
}

function collectRefs(content: StudioContent): string[] {
  if ("nodes" in content) return content.nodes.map((node) => node.sourceRef).filter((ref): ref is string => Boolean(ref));
  if ("diagram" in content) return content.sourceRefs;
  if ("sections" in content) return [...content.sections.flatMap((section) => section.sourceRefs), ...content.keyTerms.map((term) => term.sourceRef)];
  return [...content.cards.map((card) => card.sourceRef), ...content.questions.map((question) => question.sourceRef)];
}
