import type { Snapshot, ShapeRecord } from "@quickdrawjs/react";
import type { CanvasDocument } from "./model.js";

export type InkMLPoint = { values: number[]; x: number; y: number };
export type InkMLTrace = { id: string; points: InkMLPoint[] };
export type InkMLDocument = {
  sampleId: string;
  annotations: Record<string, string>;
  channels: Array<{ name: string; type?: string; units?: string }>;
  traces: InkMLTrace[];
};

export type InkMLLimits = { maxBytes?: number; maxStrokes?: number; maxPoints?: number; maxPointsPerStroke?: number; maxAnnotationChars?: number };
export type InkMLCanvasTransform = { scale: number; offsetX: number; offsetY: number };

const defaults: Required<InkMLLimits> = {
  maxBytes: 20_000_000,
  maxStrokes: 10_000,
  maxPoints: 100_000,
  maxPointsPerStroke: 20_000,
  maxAnnotationChars: 20_000,
};

export function parseInkML(xml: string, limits: InkMLLimits = {}): InkMLDocument {
  const budget = { ...defaults, ...limits };
  if (Buffer.byteLength(xml, "utf8") > budget.maxBytes) throw new Error("InkML file exceeds the configured size limit.");
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error("InkML DTD and entity declarations are not supported.");
  if (!/<(?:[\w.-]+:)?ink\b/i.test(xml)) throw new Error("InkML root element is missing.");
  if (/<(?:[\w.-]+:)?(?:traceGroup|traceView|context|definitions|intermittentChannels|mapping)\b/i.test(xml)) throw new Error("This InkML uses grouping or channel features outside the supported flat-trace subset.");
  if ([...xml.matchAll(/<(?:[\w.-]+:)?traceFormat\b/gi)].length > 1) throw new Error("Multiple InkML trace formats are not supported.");

  const channels = [...xml.matchAll(/<(?:[\w.-]+:)?channel\b([^>]*?)\/?\s*>/gi)].map((match) => {
    const attributes = parseAttributes(match[1]);
    return { name: attributes.name ?? "", ...(attributes.type ? { type: attributes.type } : {}), ...(attributes.units ? { units: attributes.units } : {}) };
  }).filter((channel) => channel.name);
  const coordinateChannels = channels.length ? channels : [{ name: "X" }, { name: "Y" }];
  const xIndex = coordinateChannels.findIndex((channel) => channel.name.toUpperCase() === "X");
  const yIndex = coordinateChannels.findIndex((channel) => channel.name.toUpperCase() === "Y");
  if (xIndex < 0 || yIndex < 0) throw new Error("InkML must declare X and Y channels.");

  const annotations: Record<string, string> = {};
  for (const match of xml.matchAll(/<(?:[\w.-]+:)?annotation\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?annotation\s*>/gi)) {
    const type = parseAttributes(match[1]).type;
    if (!type || type.length > 120) continue;
    const value = decodeXmlText(match[2].replace(/<\/?(?:[\w.-]+:)?[^>]*>/g, "").trim());
    if (value.length <= budget.maxAnnotationChars && !(type in annotations)) annotations[type] = value;
  }

  const traces: InkMLTrace[] = [];
  let totalPoints = 0;
  const seenTraceIds = new Set<string>();
  const tracePattern = /<(?:[\w.-]+:)?trace\b([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/(?:[\w.-]+:)?trace\s*>)/gi;
  for (const match of xml.matchAll(tracePattern)) {
    if (traces.length >= budget.maxStrokes) throw new Error("InkML exceeds the configured stroke limit.");
    const attributes = parseAttributes(match[1]);
    const id = attributes.id ?? String(traces.length);
    if (!id || id.length > 512 || seenTraceIds.has(id)) throw new Error("InkML has a missing, oversized, or duplicate trace ID.");
    seenTraceIds.add(id);
    const body = match[2] ?? "";
    const points: InkMLPoint[] = [];
    for (const tuple of body.split(",")) {
      const fields = tuple.trim().split(/[\s;]+/).filter(Boolean);
      if (!fields.length) continue;
      if (fields.length !== coordinateChannels.length) throw new Error(`InkML trace ${id} does not match its declared channel count.`);
      const values = fields.map((field) => Number(field));
      if (!values.every(Number.isFinite)) throw new Error(`InkML trace ${id} contains a non-finite point value.`);
      points.push({ values, x: values[xIndex], y: values[yIndex] });
      totalPoints++;
      if (points.length > budget.maxPointsPerStroke || totalPoints > budget.maxPoints) throw new Error("InkML exceeds the configured point limit.");
    }
    if (points.length) traces.push({ id, points });
  }
  if (!traces.length) throw new Error("InkML contains no usable strokes.");

  return { sampleId: annotations.sampleId || annotations.sampleID || "unknown", annotations, channels: coordinateChannels, traces };
}

export function fitInkMLCanvas(ink: InkMLDocument, frame = { x: 80, y: 80, width: 1120, height: 640 }): InkMLCanvasTransform {
  if (!ink.traces.length) throw new Error("InkML contains no usable strokes.");
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const trace of ink.traces) for (const point of trace.points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  const scale = Math.min(1, frame.width / Math.max(1, maxX - minX), frame.height / Math.max(1, maxY - minY));
  return { scale, offsetX: frame.x + (frame.width - (maxX - minX) * scale) / 2 - minX * scale, offsetY: frame.y + (frame.height - (maxY - minY) * scale) / 2 - minY * scale };
}

export function inkMLToCanvasDocument(ink: InkMLDocument, prefix = ink.sampleId, transform: InkMLCanvasTransform = { scale: 1, offsetX: 0, offsetY: 0 }): CanvasDocument {
  if (!Number.isFinite(transform.scale) || transform.scale <= 0 || !Number.isFinite(transform.offsetX) || !Number.isFinite(transform.offsetY)) throw new Error("InkML canvas transform is invalid.");
  const pressureIndex = ink.channels.findIndex((channel) => /^(?:P|PRESSURE)$/i.test(channel.name) || /pressure/i.test(channel.type ?? ""));
  let minPressure = Infinity, maxPressure = -Infinity;
  if (pressureIndex >= 0) for (const trace of ink.traces) for (const point of trace.points) {
    minPressure = Math.min(minPressure, point.values[pressureIndex]); maxPressure = Math.max(maxPressure, point.values[pressureIndex]);
  }
  const store: Record<string, ShapeRecord> = {};
  ink.traces.forEach((trace, index) => {
    const id = `shape:inkml-${safeId(prefix)}-${safeId(trace.id)}`;
    store[id] = {
      id,
      typeName: "shape",
      type: "draw",
      x: 0,
      y: 0,
      rot: 0,
      z: index + 1,
      props: {
        pts: trace.points.flatMap(({ x, y, values }) => [x * transform.scale + transform.offsetX, y * transform.scale + transform.offsetY, pressureIndex < 0 ? 0.5 : maxPressure <= 1 ? Math.max(0, Math.min(1, values[pressureIndex])) : maxPressure === minPressure ? 0.5 : 0.1 + 0.9 * (values[pressureIndex] - minPressure) / (maxPressure - minPressure)]),
        color: "black",
        size: "s",
        dash: "draw",
        done: true,
      },
    };
  });
  const snapshot: Snapshot = { document: { store } };
  return { version: 1, snapshot, objects: [] };
}

export function inkMLProvenance(ink: InkMLDocument, sourceFile: string, canvasTransform: InkMLCanvasTransform = { scale: 1, offsetX: 0, offsetY: 0 }) {
  return {
    dataset: "inkml",
    sourceFile,
    sampleId: ink.sampleId,
    annotations: ink.annotations,
    channels: ink.channels,
    canvasTransform,
    strokeCount: ink.traces.length,
    pointCount: ink.traces.reduce((sum, trace) => sum + trace.points.length, 0),
    traces: ink.traces.map((trace) => ({ id: trace.id, points: trace.points.map(({ values }) => values) })),
  };
}

function parseAttributes(value: string) {
  const result: Record<string, string> = {};
  for (const match of value.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) result[match[1].split(":").at(-1)!] = decodeXmlText(match[2] ?? match[3] ?? "");
  return result;
}

function decodeXmlText(value: string) {
  return value.replace(/&#x([\da-f]+);/gi, (_match, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#(\d+);/g, (_match, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || "trace";
}
