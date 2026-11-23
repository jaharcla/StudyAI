import { describe, expect, it } from "vitest";
import { artifactBriefSchema, compileArtifactBrief } from "../src/canvas/ai/teaching-scene";
import { applyArtifactBriefProposal, proposeArtifactBrief } from "../src/canvas/tutor";
import { authoringViewport, canvasAuthoringTasks } from "./fixtures/canvas-authoring-tasks";
import type { ScientificObject } from "../src/canvas/model";

const GAP = 60;
const intersects = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const separated = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x + a.width + GAP <= b.x || b.x + b.width + GAP <= a.x || a.y + a.height + GAP <= b.y || b.y + b.height + GAP <= a.y;
const inside = (r: { x: number; y: number; width: number; height: number }) =>
  r.x >= authoringViewport.x && r.y >= authoringViewport.y && r.x + r.width <= authoringViewport.x + authoringViewport.width && r.y + r.height <= authoringViewport.y + authoringViewport.height;

describe("author_board composition metrics", () => {
  it("scores legality, task completion, grounding, labelling and interaction cost on the corpus", () => {
    const summary: Array<Record<string, unknown>> = [];
    for (const task of canvasAuthoringTasks) {
      const brief = artifactBriefSchema.parse(task.brief);
      const compiled = compileArtifactBrief(brief, { occupancy: task.occupancy, viewport: authoringViewport });
      const rects = compiled.objects.map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height }));

      // Spatial legality: no overlap with existing content, 60px separation, nothing off-board.
      for (const rect of rects) {
        expect(task.occupancy.some((occupied) => intersects(rect, occupied))).toBe(false);
        expect(task.occupancy.every((occupied) => separated(rect, occupied))).toBe(true);
        expect(inside(rect)).toBe(true);
      }
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        if (intersects(rects[i], rects[j])) expect(separated(rects[i], rects[j])).toBe(true);
      }

      // Task completion, grounding, verification labelling, one review transaction.
      expect(compiled.objects.map((object) => object.kind)).toEqual(task.expected.kinds);
      expect(compiled.sourceRefs).toEqual(task.expected.sourceRefs);
      expect(compiled.objects.every((object) => object.provenance?.status === "generated-unverified")).toBe(true);
      const context = { boardId: brief.boardId, courseId: "c", lessonId: "l", revision: 1, objects: [] as ScientificObject[] };
      const proposal = proposeArtifactBrief(context, task.brief, 1);
      const applied = applyArtifactBriefProposal(context, proposal);
      expect(applied).toHaveLength(task.expected.kinds.length);

      summary.push({
        id: task.id,
        spatialLegality: "pass", taskCompletion: "pass", grounding: "pass",
        verificationLabelling: "pass", interactionCost: 1, objects: applied.length,
      });
    }
    // The written prediction: empty board passes legality; reuse also passes because the planner
    // reads real occupancy. A crowded board must return a conflict and place nothing.
    expect(() => compileArtifactBrief(artifactBriefSchema.parse(canvasAuthoringTasks[0].brief), { occupancy: [authoringViewport], viewport: authoringViewport })).toThrow();
    console.info(JSON.stringify({ metric: "author_board_composition", tasks: summary }));
  });
});
