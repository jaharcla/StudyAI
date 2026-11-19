import type { Bounds } from "@quickdrawjs/core";
import type { CanvasSceneGraph } from "../spatial/types.js";
import { buildCanvasSceneAIContext, type CanvasSceneAIContext } from "./scene-context.js";

export type TutorCanvasViewport = { x: number; y: number; w: number; h: number };

export type TutorCanvasContext = {
  scene: CanvasSceneAIContext | null;
  selectedIds: string[];
  viewport: TutorCanvasViewport;
  warnings: string[];
};

export function buildTutorCanvasContext(input: {
  scene: CanvasSceneGraph | null;
  selectedIds: readonly string[];
  viewport: Bounds;
}): TutorCanvasContext {
  const viewport = { x: input.viewport.x, y: input.viewport.y, w: input.viewport.w, h: input.viewport.h };
  if (!input.scene) {
    return {
      scene: null,
      selectedIds: [...input.selectedIds],
      viewport,
      warnings: ["Canvas scene unavailable for this revision."],
    };
  }
  return {
    scene: buildCanvasSceneAIContext(input.scene),
    selectedIds: [...input.selectedIds],
    viewport,
    warnings: [],
  };
}
