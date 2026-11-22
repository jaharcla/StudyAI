import type { Bounds } from "@quickdrawjs/core";
import type { CanvasSceneGraph } from "../spatial/types.js";
import type { CanvasAIContext } from "./canvas-context.js";
import { buildCanvasSceneAIContext, type CanvasSceneAIContext } from "./scene-context.js";

export type TutorCanvasViewport = { x: number; y: number; w: number; h: number };
export type TutorCanvasJson = string | number | boolean | null | TutorCanvasJson[] | { [key: string]: TutorCanvasJson };
export type TutorCanvasShapes = { [key: string]: TutorCanvasJson };

export type TutorCanvasContext = {
  scene: CanvasSceneAIContext | null;
  shapes: TutorCanvasShapes | null;
  selectedIds: string[];
  viewport: TutorCanvasViewport;
  warnings: string[];
};

export function buildTutorCanvasContext(input: {
  scene: CanvasSceneGraph | null;
  shapes: CanvasAIContext | null;
  selectedIds: readonly string[];
  viewport: Bounds;
}): TutorCanvasContext {
  const viewport = { x: input.viewport.x, y: input.viewport.y, w: input.viewport.w, h: input.viewport.h };
  const shapes = input.shapes ? JSON.parse(JSON.stringify(input.shapes)) as TutorCanvasShapes : null;
  if (!input.scene) {
    return {
      scene: null,
      shapes,
      selectedIds: [...input.selectedIds],
      viewport,
      warnings: ["Canvas scene unavailable for this revision."],
    };
  }
  return {
    scene: buildCanvasSceneAIContext(input.scene, { selectedIds: input.selectedIds, viewport: input.viewport }),
    shapes,
    selectedIds: [...input.selectedIds],
    viewport,
    warnings: [],
  };
}
