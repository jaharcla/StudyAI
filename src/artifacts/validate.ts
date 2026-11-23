import { analyzePhysicsFreeBodyDiagram } from "../canvas/physics";
import { compileExpressionSync } from "../canvas/expressions";
import { emptyCanvasDocument, parseCanvasDocument, type ScientificObject } from "../canvas/model";
import type { ArtifactBrief } from "../canvas/ai/teaching-scene";
import type { LayoutRect } from "../canvas/ai/layout";
import type { ValidationContext, ValidationProblem, ValidationReport, Validator } from "./contracts";

const intersects = (a: LayoutRect, b: LayoutRect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Each validator delegates to an authority that already exists; none reimplements physics or algebra. */
const validators: Validator[] = [
  {
    id: "force-diagram",
    appliesTo: (object) => object.kind === "force" || object.kind === "vector",
    check(object, ctx) {
      const surfaceAngleDeg = ctx.brief.artifact.figure?.context?.surfaceAngleDeg;
      if (surfaceAngleDeg === undefined) return [];
      const analysis = analyzePhysicsFreeBodyDiagram({ objects: ctx.objects, surfaceAngleDeg });
      return analysis.issues.filter((issue) => issue.targetId === object.id).map((issue) => issue.message);
    },
  },
  {
    id: "equation",
    appliesTo: (object) => object.kind === "equation",
    check(object) {
      if (object.kind !== "equation") return [];
      try {
        const evaluator = compileExpressionSync(object.expression);
        evaluator.evaluate(Object.fromEntries(evaluator.variables.map((name) => [name, 0])));
      } catch (error) {
        return [`Equation expression has no finite evaluation: ${error instanceof Error ? error.message : "unknown error"}`];
      }
      return [];
    },
  },
  {
    id: "graph",
    appliesTo: (object) => object.kind === "graph",
    check(object) {
      if (object.kind !== "graph") return [];
      try {
        const evaluator = compileExpressionSync(object.expression);
        if (evaluator.variables.some((name) => name !== "x")) return ["A graph expression may only use x."];
        if (object.points.length < 2) return ["A graph needs at least two sampled points."];
        for (const [x, y] of object.points) {
          if (!Number.isFinite(x) || !Number.isFinite(y)) return ["A graph point is not finite."];
          if (Math.abs(evaluator.evaluate({ x }) - y) > 1e-6) return [`The sampled point at x=${x} does not match the expression.`];
        }
      } catch (error) {
        return [`Graph expression is invalid: ${error instanceof Error ? error.message : "unknown error"}`];
      }
      return [];
    },
  },
  {
    id: "mind-map",
    appliesTo: (object) => object.kind === "mindmap",
    check(object) {
      if (object.kind !== "mindmap" || object.nodes.length < 2) return [];
      const connected = new Set(object.edges.flatMap((edge) => [edge.from, edge.to]));
      const orphans = object.nodes.filter((node) => !connected.has(node.id));
      return orphans.length
        ? [`Mind map has ${orphans.length} unconnected node(s): ${orphans.map((node) => node.label).join(", ")}.`]
        : [];
    },
  },
  {
    id: "geometry",
    appliesTo: () => true,
    check(object, ctx) {
      const rect: LayoutRect = { x: object.x, y: object.y, width: object.width, height: object.height };
      const { viewport } = ctx;
      if (rect.x < viewport.x || rect.y < viewport.y || rect.x + rect.width > viewport.x + viewport.width || rect.y + rect.height > viewport.y + viewport.height) {
        return ["Object lies outside the visible board."];
      }
      if (ctx.occupancy.some((occupied) => intersects(rect, occupied))) return ["Object overlaps existing board content."];
      if (ctx.objects.some((other) => other.id !== object.id && intersects(rect, other))) return ["Object overlaps another generated component."];
      return [];
    },
  },
];

export function validateCompiled(input: {
  objects: ScientificObject[];
  brief: ArtifactBrief;
  occupancy: readonly LayoutRect[];
  viewport: LayoutRect;
}): ValidationReport {
  const ctx: ValidationContext = input;
  const problems: ValidationProblem[] = [];
  for (const object of input.objects) {
    for (const validator of validators) {
      if (!validator.appliesTo(object)) continue;
      for (const message of validator.check(object, ctx)) {
        problems.push({
          componentId: object.id,
          validator: validator.id,
          message,
          requestedCorrection: `Fix the ${object.kind} component: ${message}`,
        });
      }
    }
  }
  try {
    parseCanvasDocument({ ...emptyCanvasDocument(), objects: [...input.objects] });
  } catch (error) {
    problems.push({
      componentId: "bundle",
      validator: "canvas-document",
      message: error instanceof Error ? error.message : "Generated objects do not form a valid canvas document.",
      requestedCorrection: "Recompose the artifact as schema-valid scientific objects before applying it.",
    });
  }
  return { ok: problems.length === 0, problems };
}
