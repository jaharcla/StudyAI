import {
  CanvasRecognitionResultSchema,
  type CanvasRecognitionAdapter,
  type CanvasRecognitionCandidate,
  type CanvasRecognitionInput,
  type CanvasRecognitionPoint,
  type CanvasRecognitionResult,
} from "./types.js";

export type StrokeGeometryFeatures = {
  pointCount: number;
  pathLength: number;
  width: number;
  height: number;
  aspect: number;
  closed: boolean;
  endpointDistance: number;
  turnCount: number;
};

export function strokeGeometryFeatures(points: readonly CanvasRecognitionPoint[]): StrokeGeometryFeatures {
  const usable = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!usable.length) return { pointCount: 0, pathLength: 0, width: 0, height: 0, aspect: 1, closed: false, endpointDistance: 0, turnCount: 0 };
  const xs = usable.map((point) => point.x), ys = usable.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  let pathLength = 0, turnCount = 0;
  for (let index = 1; index < usable.length; index++) pathLength += Math.hypot(usable[index].x - usable[index - 1].x, usable[index].y - usable[index - 1].y);
  for (let index = 2; index < usable.length; index++) {
    const a = usable[index - 2], b = usable[index - 1], c = usable[index];
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    const denominator = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (denominator > 0 && (ux * vx + uy * vy) / denominator < 0.8) turnCount++;
  }
  const first = usable[0], last = usable[usable.length - 1];
  const endpointDistance = Math.hypot(last.x - first.x, last.y - first.y);
  const aspect = Math.max(width, height) / Math.max(Math.min(width, height), 1e-6);
  return {
    pointCount: usable.length,
    pathLength,
    width,
    height,
    aspect,
    closed: usable.length > 2 && endpointDistance <= Math.max(4, pathLength * 0.08),
    endpointDistance,
    turnCount,
  };
}

function classify(features: StrokeGeometryFeatures): CanvasRecognitionCandidate[] {
  const { pathLength, aspect, closed, turnCount, width, height, pointCount } = features;
  if (!pointCount) return [];
  if (pathLength <= 8 || (width <= 8 && height <= 8)) {
    return [
      { label: "dot", kind: "shape", confidence: 0.55, alternatives: [] },
      { label: "mark", kind: "symbol", confidence: 0.45, alternatives: ["dot"] },
    ];
  }
  if (aspect >= 4 && turnCount <= 1) {
    return [
      { label: "line", kind: "shape", confidence: 0.6, alternatives: ["underline"] },
      { label: "underline", kind: "diagram-element", confidence: 0.45, alternatives: ["line"] },
    ];
  }
  if (closed && aspect <= 3) {
    return [
      { label: "circle", kind: "shape", confidence: 0.55, alternatives: ["closed shape"] },
      { label: "closed shape", kind: "shape", confidence: 0.45, alternatives: ["circle"] },
    ];
  }
  if (turnCount >= 3 && !closed) {
    return [
      { label: "cross", kind: "symbol", confidence: 0.5, alternatives: ["scribble"] },
      { label: "scribble", kind: "diagram-element", confidence: 0.45, alternatives: ["cross"] },
    ];
  }
  return [
    { label: "mark", kind: "symbol", confidence: 0.5, alternatives: ["stroke"] },
    { label: "stroke", kind: "shape", confidence: 0.45, alternatives: ["mark"] },
  ];
}

export class BaselineCanvasRecognitionAdapter implements CanvasRecognitionAdapter {
  readonly id = "geometry-baseline";
  readonly version = "1";

  async recognize(inputs: readonly CanvasRecognitionInput[]): Promise<CanvasRecognitionResult[]> {
    return inputs.map((input) => {
      const features = strokeGeometryFeatures(input.points);
      const candidates = classify(features);
      return CanvasRecognitionResultSchema.parse({
        groupId: input.groupId,
        sourceIds: input.sourceIds.slice(0, 64),
        bounds: input.bounds,
        candidates,
        uncertain: true,
        uncertaintyReasons: candidates.length
          ? ["Geometry-only symbol candidate; not a semantic label."]
          : ["No usable stroke points for geometry recognition."],
      });
    });
  }
}
