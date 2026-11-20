import { createHash } from "node:crypto";
import type { CanvasShapeContext } from "../../src/canvas/ai/canvas-context.js";
import type { ScientificObject } from "../../src/canvas/model.js";
import { CanvasChunkSchema, type CanvasChunk } from "./types.js";

/** Clusters closer than this belong to the same region. */
const CLUSTER_GAP = 40;
/** Chunks overlap by ten percent so a shape on a seam is a candidate for both. */
const OVERLAP = 0.1;
const MAX_CHUNKS = 6;
const MAX_ITEMS_PER_CHUNK = 40;
const MAX_DETAIL_CHARS = 7_600;
const MAX_LABELS = 40;

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "what", "which", "who", "whom",
  "on", "in", "at", "of", "and", "or", "to", "for", "with", "this", "that", "these", "those",
  "there", "it", "its", "do", "does", "did", "drawn", "draw", "shown", "show", "side", "board",
  "give", "list", "tell", "me", "please", "can", "you", "how", "many", "much",
]);

type Box = { x: number; y: number; w: number; h: number };

type Item = {
  id: string;
  box: Box;
  /** Annotations link regions; they never join two regions into one. */
  annotation: boolean;
  labels: string[];
  summary: Record<string, unknown>;
};

export type CanvasChunkInput = {
  shapes: readonly CanvasShapeContext[];
  objects: readonly ScientificObject[];
  question: string;
  selectedIds: readonly string[];
};

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function boxGap(a: Box, b: Box): number {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  return Math.hypot(dx, dy);
}

function expand(box: Box): Box {
  const dx = box.w * OVERLAP, dy = box.h * OVERLAP;
  return { x: box.x - dx, y: box.y - dy, w: box.w + dx * 2, h: box.h + dy * 2 };
}

function intersects(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function center(box: Box): { x: number; y: number } {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/u).filter((token) => token.length > 0 && token.length <= 40 && !STOP_WORDS.has(token));
}

function shapeItem(shape: CanvasShapeContext): Item {
  const labels: string[] = [];
  const summary: Record<string, unknown> = { id: shape.id, type: shape.type };
  if (shape.text) {
    labels.push(shape.text);
    summary.text = shape.text.slice(0, 300);
  }
  if (shape.arrow) {
    summary.from = { x: shape.arrow.from.x, y: shape.arrow.from.y };
    summary.to = { x: shape.arrow.to.x, y: shape.arrow.to.y };
    if (shape.arrow.label) {
      labels.push(shape.arrow.label);
      summary.label = shape.arrow.label;
    }
    if (shape.arrow.labels?.length) {
      labels.push(...shape.arrow.labels.map((label) => label.text));
      summary.labels = shape.arrow.labels.map((label) => label.text).slice(0, 6);
    }
    if (shape.arrow.startAttached?.length) summary.startAttached = shape.arrow.startAttached.map((attachment) => attachment.kind);
    if (shape.arrow.endAttached?.length) summary.endAttached = shape.arrow.endAttached.map((attachment) => attachment.kind);
  }
  if (shape.strokeSummary) summary.points = shape.strokeSummary.pointCount;
  return {
    id: shape.id,
    box: { x: shape.bounds.x, y: shape.bounds.y, w: shape.bounds.w, h: shape.bounds.h },
    annotation: shape.type === "arrow" || shape.type === "line",
    labels,
    summary,
  };
}

function objectLabels(object: ScientificObject): string[] {
  switch (object.kind) {
    case "atom":
    case "bond":
    case "vector":
    case "force":
    case "measurement":
    case "relationship":
      return object.label ? [object.label] : [];
    case "molecule":
      return [object.name];
    case "equation":
    case "graph":
      return [object.expression];
    case "anatomy":
      return object.labels;
    case "concept":
      return [object.title, object.definition];
    case "linked-note":
    case "linked-document":
      return [object.title, object.excerpt];
    case "question":
      return [object.prompt, object.answer ?? ""];
    case "flashcard":
      return [object.front, object.back];
    default:
      return [];
  }
}

function objectItem(object: ScientificObject): Item {
  const labels = objectLabels(object).filter((label) => label.trim().length > 0);
  const annotation = object.kind === "bond" || object.kind === "relationship" || object.kind === "vector" || object.kind === "force" || object.kind === "measurement";
  return {
    id: object.id,
    box: { x: object.x, y: object.y, w: Math.max(0, object.width), h: Math.max(0, object.height) },
    annotation,
    labels,
    summary: { id: object.id, kind: object.kind, label: labels[0]?.slice(0, 200) },
  };
}

/** Splits an over-large group into a balanced two-dimensional grid of bounded cells. */
function splitGroup(items: Item[]): Item[][] {
  if (items.length <= MAX_ITEMS_PER_CHUNK) return [items];
  const cells = Math.ceil(items.length / MAX_ITEMS_PER_CHUNK);
  const columns = Math.ceil(Math.sqrt(cells));
  const rows = Math.ceil(cells / columns);
  const byRow = [...items].sort((a, b) => center(a.box).y - center(b.box).y || a.id.localeCompare(b.id));
  const rowSize = Math.ceil(byRow.length / rows);
  const groups: Item[][] = [];
  for (let row = 0; row < byRow.length; row += rowSize) {
    const rowItems = byRow.slice(row, row + rowSize).sort((a, b) => center(a.box).x - center(b.box).x || a.id.localeCompare(b.id));
    const columnSize = Math.ceil(rowItems.length / columns);
    for (let column = 0; column < rowItems.length; column += columnSize) groups.push(rowItems.slice(column, column + columnSize));
  }
  return groups.length ? groups : [items];
}

function buildGroups(items: Item[]): Item[][] {
  const structural = items.filter((item) => !item.annotation);
  const source = structural.length ? structural : items;

  const parent = source.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== root) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  for (let left = 0; left < source.length; left++) {
    for (let right = left + 1; right < source.length; right++) {
      if (boxGap(source[left].box, source[right].box) <= CLUSTER_GAP) parent[find(right)] = find(left);
    }
  }

  const byRoot = new Map<number, Item[]>();
  source.forEach((item, index) => {
    const root = find(index);
    const group = byRoot.get(root);
    if (group) group.push(item);
    else byRoot.set(root, [item]);
  });

  let groups = [...byRoot.values()];
  while (groups.length > MAX_CHUNKS) {
    let bestLeft = 0, bestRight = 1, bestGap = Number.POSITIVE_INFINITY;
    for (let left = 0; left < groups.length; left++) {
      for (let right = left + 1; right < groups.length; right++) {
        const boxes = [groups[left].reduce((box, item) => union(box, item.box), groups[left][0].box), groups[right].reduce((box, item) => union(box, item.box), groups[right][0].box)];
        const gap = boxGap(boxes[0], boxes[1]);
        if (gap < bestGap) {
          bestGap = gap;
          bestLeft = left;
          bestRight = right;
        }
      }
    }
    groups = [...groups.filter((_, index) => index !== bestLeft && index !== bestRight), [...groups[bestLeft], ...groups[bestRight]]];
  }

  return groups.flatMap(splitGroup);
}

function chunkId(sourceIds: readonly string[]): string {
  return `chnk_${createHash("sha256").update([...sourceIds].sort().join("|")).digest("hex").slice(0, 16)}`;
}

export function buildCanvasChunks(input: CanvasChunkInput): CanvasChunk[] {
  const items = [...input.shapes.map(shapeItem), ...input.objects.map(objectItem)];
  if (!items.length) return [];

  const annotations = items.filter((item) => item.annotation);
  const questionTokens = tokens(input.question);
  const cueLeft = questionTokens.includes("left");
  const cueRight = questionTokens.includes("right");
  const cueTop = questionTokens.includes("top") || questionTokens.includes("above");
  const cueBottom = questionTokens.includes("bottom") || questionTokens.includes("below");
  const allBox = items.reduce((box, item) => union(box, item.box), items[0].box);
  const middle = center(allBox);
  const selected = new Set(input.selectedIds);

  const drafts = buildGroups(items).map((members) => {
    const memberBox = members.reduce((box, item) => union(box, item.box), members[0].box);
    const candidateBox = expand(memberBox);
    const memberIds = new Set(members.map((item) => item.id));
    const candidates = annotations.filter((item) => !memberIds.has(item.id) && intersects(expand(item.box), candidateBox));
    const included = [...members, ...candidates];
    const sourceIds = [...new Set(included.map((item) => item.id))].sort();
    const labels = [...new Set(members.flatMap((item) => item.labels).map((label) => label.slice(0, 200)))].slice(0, MAX_LABELS);

    const labelTokens = new Set(members.flatMap((item) => item.labels.flatMap(tokens)));
    let score = questionTokens.filter((token) => labelTokens.has(token)).length * 2;
    if (members.some((item) => selected.has(item.id))) score += 3;
    const centroid = center(memberBox);
    if (cueLeft && centroid.x < middle.x) score += 2;
    if (cueRight && centroid.x > middle.x) score += 2;
    if (cueTop && centroid.y < middle.y) score += 2;
    if (cueBottom && centroid.y > middle.y) score += 2;

    const summaries: Array<Record<string, unknown>> = included.map((item) => item.summary);
    let detail = JSON.stringify(summaries);
    while (detail.length > MAX_DETAIL_CHARS && summaries.length > 1) {
      summaries.pop();
      detail = JSON.stringify(summaries);
    }

    return {
      score,
      area: memberBox.w * memberBox.h,
      chunk: CanvasChunkSchema.parse({
        id: chunkId(sourceIds),
        bounds: { x: memberBox.x, y: memberBox.y, width: memberBox.w, height: memberBox.h },
        sourceIds,
        labels,
        detail,
        relevance: Math.min(1, score / 6),
      }),
    };
  });

  drafts.sort((left, right) => right.score - left.score || right.area - left.area || (left.chunk.sourceIds[0] ?? "").localeCompare(right.chunk.sourceIds[0] ?? ""));
  return drafts.map((draft) => draft.chunk);
}
