/**
 * Real-board check for the canvas reasoning loop.
 *
 *   npx tsx scripts/benchmark-canvas-reasoning.ts --board <id> --question "..." [--calls 3]
 *
 * Loads a saved board, builds deterministic chunks, runs the sequential reasoning
 * loop against the configured provider, and prints the state the tutor would see.
 * Reads the database; writes nothing.
 */
import { ChatOllama } from "@langchain/ollama";
import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { db } from "../server/db.js";
import { getTutorProviderSettings } from "../server/tutor-provider.js";
import { buildCanvasChunks, reasonOverCanvas } from "../server/canvas-reasoning/index.js";
import { buildCanvasAIContext } from "../src/canvas/ai/canvas-context.js";
import { parseCanvasDocument } from "../src/canvas/model.js";

function argument(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}.`);
}

const boardId = argument("board");
const question = argument("question");
const maxPasses = Number(argument("calls", "3"));
if (!Number.isInteger(maxPasses) || maxPasses < 1 || maxPasses > 12) throw new Error("--calls must be an integer from 1 through 12.");

const row = db.prepare("SELECT document,course_id,lesson_id,revision FROM canvases WHERE id=?").get(boardId) as { document: string; course_id: string; lesson_id: string; revision: number } | undefined;
if (!row) throw new Error(`No saved board ${boardId}.`);

const saved = parseCanvasDocument(JSON.parse(row.document));
const shapes = buildCanvasAIContext({
  source: saved.snapshot,
  selectedIds: [],
  viewport: { x: 0, y: 0, w: 4000, h: 3000 },
  objects: saved.objects,
  maxItems: 200,
  maxChars: 200_000,
  scope: { boardId, courseId: row.course_id, lessonId: row.lesson_id, revision: row.revision },
});
const chunks = buildCanvasChunks({ shapes: [...shapes.selected, ...shapes.visible], objects: saved.objects, question, selectedIds: [] });

const settings = getTutorProviderSettings();
const model = settings.provider === "groq"
  ? new ChatGroq({ apiKey: process.env.GROQ_API_KEY, model: settings.groqModel, temperature: 0.2, maxRetries: 0, maxTokens: settings.maxCompletionTokens })
  : new ChatOllama({ model: settings.ollamaModel, temperature: 0.2, numCtx: 16_384, numPredict: settings.maxCompletionTokens });

const started = Date.now();
const outcome = await reasonOverCanvas({
  boardId,
  revisionHash: `${boardId}:${row.revision}`,
  question,
  chunks,
  maxPasses,
  call: async ({ system, prompt }) => {
    const response = await model.invoke([new SystemMessage(system), new HumanMessage(prompt)]);
    return typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  },
});
const latencyMs = Date.now() - started;

console.log(JSON.stringify({
  boardId,
  revision: row.revision,
  provider: settings.provider,
  model: settings.provider === "groq" ? settings.groqModel : settings.ollamaModel,
  question,
  latencyMs,
  chunks: chunks.map((chunk) => ({ id: chunk.id, relevance: chunk.relevance ?? 0, sources: chunk.sourceIds.length, labels: chunk.labels.slice(0, 6) })),
  calls: outcome.calls,
  exhausted: outcome.exhausted,
  needsUser: outcome.state.needsUser === true,
  coveredChunks: outcome.state.coveredChunks,
  claims: outcome.state.claims.map((claim) => ({ subject: claim.subject, relation: claim.relation, object: claim.object, value: claim.value, status: claim.status, confidence: claim.confidence, evidence: claim.evidence })),
  contradictions: outcome.state.contradictions,
  unresolved: outcome.state.unresolved,
  answerContext: outcome.answerContext,
}, null, 2));
