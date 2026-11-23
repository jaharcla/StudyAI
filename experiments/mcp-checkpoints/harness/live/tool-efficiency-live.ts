import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeEvidence } from "../src/evidence.js";
import { chat, type ChatMessage, type ToolDef, type ToolCall } from "./ollama.js";

type ArtifactTask = {
  id: string;
  kind: string;
  prompt: string;
  expectedObjects: number;
  expectedRelationships: number;
};

type SurfaceName = "current" | "granular" | "batched";

type Board = { objects: number; relationships: number };

type RunResult = {
  surface: SurfaceName;
  taskId: string;
  calls: number;
  invalidCalls: number;
  retries: number;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  attempts: number;
  objects: number;
  relationships: number;
  completed: boolean;
  quality: number;
  trace: Array<{ turn: number; toolCalls: ToolCall[]; content: string }>;
};

const boardId = { type: "string", description: "Active board id" } as const;

const currentTools: ToolDef[] = [
  {
    name: "propose_canvas_action",
    description:
      "Consequential: requires user approval. Propose an array of native QuickDraw shape actions for review. Supports createShape, createText, createArrow, updateShape, moveShape, deleteShape, highlightShape, selectShapes.",
    parameters: {
      type: "object",
      properties: {
        boardId,
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["createShape", "createText", "createArrow", "updateShape", "moveShape", "deleteShape", "highlightShape", "selectShapes"] },
              id: { type: "string" },
              type: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              text: { type: "string" },
              from: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
              to: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
            },
          },
        },
      },
    },
  },
  { name: "get_canvas_state", description: "Read-only native shape summary.", parameters: { type: "object", properties: { boardId, shapeIds: { type: "array", items: { type: "string" } } } } },
  { name: "get_canvas_scene", description: "Read-only bounded scene graph.", parameters: { type: "object", properties: { boardId, maxNodes: { type: "number" } } } },
  { name: "read_canvas_ink", description: "Read-only ink transcription for a freehand group.", parameters: { type: "object", properties: { boardId, groupIds: { type: "array", items: { type: "string" } } } } },
  { name: "search_canvas_evidence", description: "Read-only search over revision-bound scene evidence.", parameters: { type: "object", properties: { boardId, query: { type: "string" }, limit: { type: "number" } } } },
  { name: "describe_canvas", description: "Read-only plain-text description of the active board.", parameters: { type: "object", properties: { boardId } } },
  { name: "read_design_guide", description: "Read-only layout and annotation guide.", parameters: { type: "object", properties: { topic: { type: "string", description: "Optional topic" } } } },
  { name: "get_artifact_capabilities", description: "Read-only list of supported artifact kinds.", parameters: { type: "object", properties: { topic: { type: "string", description: "Optional topic" } } } },
  { name: "propose_teaching_scene", description: "Consequential: propose a semantic teaching scene as a reviewed action batch.", parameters: { type: "object", properties: { boardId, nodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } } } }, edges: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" } } } } } } },
  { name: "propose_scientific_object", description: "Consequential: propose a scientific object for review.", parameters: { type: "object", properties: { boardId, kind: { type: "string" }, label: { type: "string" } } } },
];

const granularTools: ToolDef[] = [
  { name: "create_shape", description: "Create one native shape.", parameters: { type: "object", properties: { boardId, type: { type: "string" }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, label: { type: "string" } } } },
  { name: "create_text", description: "Create one text shape.", parameters: { type: "object", properties: { boardId, x: { type: "number" }, y: { type: "number" }, text: { type: "string" } } } },
  { name: "create_arrow", description: "Create one arrow between two points.", parameters: { type: "object", properties: { boardId, fromX: { type: "number" }, fromY: { type: "number" }, toX: { type: "number" }, toY: { type: "number" }, label: { type: "string" } } } },
  { name: "bind_arrow", description: "Bind an arrow to two shapes.", parameters: { type: "object", properties: { boardId, arrowId: { type: "string" }, fromId: { type: "string" }, toId: { type: "string" } } } },
  { name: "update_shape", description: "Update a shape property.", parameters: { type: "object", properties: { boardId, id: { type: "string" }, text: { type: "string" } } } },
  { name: "move_shape", description: "Move a shape.", parameters: { type: "object", properties: { boardId, id: { type: "string" }, x: { type: "number" }, y: { type: "number" } } } },
  { name: "delete_shape", description: "Delete a shape.", parameters: { type: "object", properties: { boardId, id: { type: "string" } } } },
  { name: "select_shapes", description: "Select shapes.", parameters: { type: "object", properties: { boardId, ids: { type: "array", items: { type: "string" } } } } },
  { name: "set_viewport", description: "Move the canvas camera.", parameters: { type: "object", properties: { boardId, x: { type: "number" }, y: { type: "number" }, zoom: { type: "number" } } } },
  { name: "read_scene", description: "Read the current scene summary.", parameters: { type: "object", properties: { boardId } } },
];

const batchedTools: ToolDef[] = [
  {
    name: "author_board",
    description: "Create or replace the entire board from a typed scene description. Consequential: requires review.",
    parameters: {
      type: "object",
      properties: {
        boardId,
        title: { type: "string" },
        nodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, type: { type: "string" }, text: { type: "string" }, x: { type: "number" }, y: { type: "number" } } } },
        edges: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" } } } },
      },
    },
  },
  { name: "read_scene", description: "Read the current scene summary.", parameters: { type: "object", properties: { boardId } } },
];

const surfaces: Record<SurfaceName, ToolDef[]> = {
  current: currentTools,
  granular: granularTools,
  batched: batchedTools,
};

function applyCall(call: ToolCall, board: Board, validNames: Set<string>): { invalid: boolean } {
  if (!validNames.has(call.name)) return { invalid: true };
  const a = call.arguments;
  const arr = (key: string): unknown[] =>
    Array.isArray(a[key]) ? (a[key] as unknown[]) : [];
  if (call.name === "propose_canvas_action") {
    for (const raw of arr("actions")) {
      if (typeof raw !== "object" || raw === null) continue;
      const action = raw as Record<string, unknown>;
      const kind = typeof action.kind === "string" ? action.kind : "";
      if (kind === "createShape" || kind === "createText") board.objects++;
      else if (kind === "createArrow") { board.objects++; board.relationships++; }
      else if (kind === "deleteShape") board.objects = Math.max(0, board.objects - 1);
    }
  } else if (call.name === "create_shape" || call.name === "create_text") board.objects++;
  else if (call.name === "create_arrow") { board.objects++; board.relationships++; }
  else if (call.name === "author_board") {
    board.objects = arr("nodes").length;
    board.relationships = arr("edges").length;
  } else if (call.name === "propose_teaching_scene") {
    board.objects = arr("nodes").length;
    board.relationships = arr("edges").length;
  } else if (call.name === "propose_scientific_object") board.objects++;
  return { invalid: false };
}

async function runSurface(
  model: string,
  surface: SurfaceName,
  task: ArtifactTask
): Promise<RunResult> {
  const tools = surfaces[surface];
  const validNames = new Set(tools.map((t) => t.name));
  const board: Board = { objects: 0, relationships: 0 };
  const messages: ChatMessage[] = [
    { role: "system", content: "You are an assistant that builds canvas artifacts. Use the available tools to create the requested artifact. Make all tool calls needed, then finish with a short summary. Do not describe shapes without calling tools." },
    { role: "user", content: `${task.prompt}\nBoard id: live-${task.id}.` },
  ];
  const trace: RunResult["trace"] = [];
  let calls = 0, invalidCalls = 0, retries = 0, promptTokens = 0, completionTokens = 0, durationNs = 0, attempts = 0;
  const seen = new Set<string>();

  for (let turn = 1; turn <= 6; turn++) {
    const result = await chat(model, messages, tools);
    promptTokens += result.promptTokens;
    completionTokens += result.completionTokens;
    durationNs += result.durationNs;
    attempts += result.attempts;
    trace.push({ turn, toolCalls: result.toolCalls, content: result.content });
    if (result.toolCalls.length === 0) break;

    const responses: string[] = [];
    for (const call of result.toolCalls) {
      calls++;
      const signature = `${call.name}:${JSON.stringify(call.arguments)}`;
      if (seen.has(signature)) retries++;
      seen.add(signature);
      const { invalid } = applyCall(call, board, validNames);
      if (invalid) invalidCalls++;
      responses.push(invalid ? `Unknown tool: ${call.name}` : `ok: ${call.name} (objects=${board.objects}, relationships=${board.relationships})`);
    }
    messages.push({ role: "assistant", content: result.content || "(tool calls)" });
    messages.push({ role: "tool", content: responses.join("\n") });
  }

  const objectRatio = Math.min(1, board.objects / Math.max(1, task.expectedObjects));
  const relationRatio = Math.min(1, board.relationships / Math.max(1, task.expectedRelationships));
  return {
    surface,
    taskId: task.id,
    calls,
    invalidCalls,
    retries,
    promptTokens,
    completionTokens,
    durationMs: Math.round(durationNs / 1e6),
    attempts,
    objects: board.objects,
    relationships: board.relationships,
    completed: objectRatio >= 0.9 && relationRatio >= 0.9,
    quality: Math.round((objectRatio * 0.6 + relationRatio * 0.4) * 100) / 100,
    trace,
  };
}

async function main() {
  const model = process.env.LIVE_MODEL ?? "qwen3.5:0.8b";
  const tasksPath = path.resolve("experiments/mcp-checkpoints/fixtures/artifacts/tasks.json");
  const parsed: unknown = JSON.parse(await readFile(tasksPath, "utf8"));
  const record = parsed as { artifacts: ArtifactTask[] };
  const results: RunResult[] = [];

  for (const surface of ["current", "granular", "batched"] as SurfaceName[]) {
    for (const task of record.artifacts) {
      const result = await runSurface(model, surface, task);
      results.push(result);
      await writeEvidence({
        experiment: "phase-5-live",
        phase: 5,
        kind: `${surface}-${task.id}`,
        payload: result,
      });
      console.log(`${surface.padEnd(8)} ${task.id.padEnd(18)} calls=${result.calls} tok=${result.promptTokens + result.completionTokens} ms=${result.durationMs} objects=${result.objects}/${task.expectedObjects} rel=${result.relationships}/${task.expectedRelationships} ok=${result.completed}`);
    }
  }

  await writeEvidence({ experiment: "phase-5-live", phase: 5, kind: "summary", payload: results });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
