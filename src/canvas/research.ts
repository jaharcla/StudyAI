import { z } from "zod";
import type { Snapshot } from "@quickdrawjs/core";
import type { ScientificObject } from "./model";

export const canvasFixtureSchema = z.object({
  schemaVersion: z.literal(1),
  fixtureId: z.string(),
  capturedAt: z.string(),
  source: z.object({ boardId: z.string(), courseId: z.string(), lessonId: z.string(), revision: z.number().int().nonnegative(), snapshotHash: z.string() }),
  domain: z.enum(["physics", "chemistry", "mathematics", "biology", "general"]),
  snapshot: z.custom<Snapshot>(),
  objects: z.array(z.custom<ScientificObject>()),
  selectedIds: z.array(z.string()),
  region: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  events: z.array(z.unknown()),
  screenshotDataUrl: z.string().optional(),
  groundTruth: z.object({ objects: z.array(z.unknown()), relationships: z.array(z.unknown()) }).optional(),
});

export const pipelineResultSchema = z.object({
  schemaVersion: z.literal(1),
  fixtureId: z.string(),
  pipelineId: z.enum(["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"]),
  pipelineVersion: z.string(),
  status: z.enum(["complete", "partial", "unavailable", "error"]),
  objects: z.array(z.unknown()),
  relationships: z.array(z.unknown()),
  interpretations: z.array(z.unknown()),
  provenance: z.array(z.unknown()),
  uncertainties: z.array(z.unknown()),
  errors: z.array(z.unknown()),
  timings: z.object({ totalMs: z.number().nonnegative(), stages: z.record(z.string(), z.number().nonnegative()) }).optional(),
});

export type CanvasFixture = z.infer<typeof canvasFixtureSchema>;
export type PipelineResult = z.infer<typeof pipelineResultSchema>;

export function diffSnapshotRecords(before: Snapshot, after: Snapshot) {
  const previous = before.document.store;
  const current = after.document.store;
  const ids = new Set([...Object.keys(previous), ...Object.keys(current)]);
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  for (const id of ids) {
    if (!previous[id]) added.push(id);
    else if (!current[id]) removed.push(id);
    else if (JSON.stringify(previous[id]) !== JSON.stringify(current[id])) modified.push(id);
  }
  return { added, removed, modified };
}

export function snapshotRecordPatch(before: Snapshot, after: Snapshot) {
  const diff = diffSnapshotRecords(before, after);
  const changed = [...diff.added, ...diff.modified];
  return { ...diff, records: Object.fromEntries(changed.map((id) => [id, after.document.store[id]])) };
}

export function replayCanvasEvents(events: Array<{ event_type: string; payload: string | unknown }>, step: number) {
  let start = -1;
  events.forEach((event, index) => { if (event.event_type === "canvas-session-start") start = index; });
  if (start < 0) return undefined;
  const initial = parseEventPayload(events[start].payload) as { snapshot?: Snapshot; objects?: ScientificObject[] };
  if (!initial.snapshot || !Array.isArray(initial.objects)) return undefined;
  let snapshot = structuredClone(initial.snapshot);
  let objects = structuredClone(initial.objects);
  const tail = events.slice(start + 1, start + 1 + Math.max(0, step));
  for (const event of tail) {
    const payload = parseEventPayload(event.payload) as { quickdraw?: { records?: Record<string, unknown>; removed?: string[] }; after?: ScientificObject[] };
    if (payload.quickdraw) {
      const store = snapshot.document.store as Record<string, unknown>;
      for (const id of payload.quickdraw.removed ?? []) delete store[id];
      Object.assign(store, payload.quickdraw.records ?? {});
    }
    if (Array.isArray(payload.after)) objects = structuredClone(payload.after);
  }
  return { snapshot, objects, step: Math.min(step, events.length - start - 1), totalSteps: events.length - start - 1 };
}

function parseEventPayload(payload: string | unknown) {
  if (typeof payload !== "string") return payload;
  try { return JSON.parse(payload); } catch { return {}; }
}

export function unionBounds(bounds: Array<{ x: number; y: number; w: number; h: number }>) {
  if (!bounds.length) return undefined;
  const x = Math.min(...bounds.map((item) => item.x));
  const y = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.w));
  const bottom = Math.max(...bounds.map((item) => item.y + item.h));
  return { x, y, w: right - x, h: bottom - y };
}
