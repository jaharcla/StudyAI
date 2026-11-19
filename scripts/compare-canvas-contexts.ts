import Database from "better-sqlite3";
import type { Snapshot } from "@quickdrawjs/core";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildCanvasAIContext } from "../src/canvas/ai/canvas-context.js";
import { buildCanvasSceneAIContext } from "../src/canvas/ai/scene-context.js";
import { buildCanvasSceneGraph } from "../server/canvas-intelligence/scene/build.js";
import { normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { projectTutorContexts } from "../server/tutor-presentation.js";
import type { ScientificObject } from "../src/canvas/model.js";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const boardId = arg("--board");
if (!boardId) throw new Error("Usage: npx tsx scripts/compare-canvas-contexts.ts --board <boardId> [--out <path>]");
const outPath = arg("--out") ?? `data/canvas-claim-benchmark/context-${boardId}.json`;

const db = new Database(process.env.STUDYAI_DB ?? "data/studyai.sqlite", { readonly: true });
const row = db.prepare("SELECT id, course_id, lesson_id, revision, document FROM canvases WHERE id=?").get(boardId) as { id: string; course_id: string; lesson_id: string; revision: number; document: string } | undefined;
if (!row) throw new Error(`Board not found: ${boardId}`);
const document = JSON.parse(row.document) as { snapshot: Snapshot; objects: ScientificObject[] };
const snapshot = document.snapshot;
const objects = document.objects;
const viewport = { x: 0, y: 0, w: 4000, h: 3000 };
const shapes = buildCanvasAIContext({
  source: snapshot,
  selectedIds: [],
  viewport,
  objects,
  scope: { boardId: row.id, courseId: row.course_id, lessonId: row.lesson_id, revision: row.revision },
});

const input = normalizeCanvasInput({
  boardId: row.id,
  courseId: row.course_id,
  lessonId: row.lesson_id,
  snapshot,
  scientificObjects: objects,
  selectedIds: [],
});
const graph = buildCanvasSceneGraph({
  input,
  scope: { boardId: row.id, courseId: row.course_id, lessonId: row.lesson_id },
  revision: row.revision,
  revisionHash: "context-compare",
  snapshotHash: "context-compare",
});
const scene = buildCanvasSceneAIContext(graph);
const compactShapes = { ...shapes, nearbyObjects: [], spatialRelationships: [] };

const formA = projectTutorContexts([{ description: "Active canvas scene", value: shapes }], false);
const formB = projectTutorContexts([{ description: "Active canvas scene", value: { scene, shapes: compactShapes, selectedIds: [], viewport, warnings: [] } }], false);
const formC = projectTutorContexts([{ description: "Active canvas scene", value: {
  scene,
  shapes: compactShapes,
  selectedIds: [],
  viewport,
  warnings: [],
  connections: compactShapes.visible
    .filter((shape) => shape.type === "arrow" && shape.arrow)
    .map((shape) => ({
      label: shape.arrow?.label ?? null,
      from: shape.arrow?.startAttached?.map((item) => item.label ?? item.kind) ?? [],
      to: shape.arrow?.endAttached?.map((item) => item.label ?? item.kind) ?? [],
      confidence: shape.arrow?.startAttached?.[0]?.confidence ?? null,
    })),
} }], false);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ boardId, revision: row.revision, formA, formB, formC }, null, 2));
console.log(`wrote ${outPath}`);
console.log(`A bytes=${JSON.stringify(formA).length} B bytes=${JSON.stringify(formB).length} C bytes=${JSON.stringify(formC).length}`);
db.close();
