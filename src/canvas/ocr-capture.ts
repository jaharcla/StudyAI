import { pageBounds, type Editor } from "@quickdrawjs/react";
import { CANVAS_OCR_DEFAULT_PADDING, CANVAS_OCR_MAX_REGIONS_PER_ANALYSIS, canvasOCRRegionTransform, clampOCRRegionLimit, groupCanvasInkStrokesForOCR, planCanvasOCRCrops, selectCanvasOCRGroups } from "./ocr-regions.js";
import type { OCRImageRegion } from "../../server/canvas-intelligence/types.js";
import type { ScientificObject } from "./model.js";

export async function captureQuickdrawOCRRegions(editor: Editor, selectedIds: string[], scientificObjects: ScientificObject[]): Promise<OCRImageRegion[]> {
  const records = editor.store.shapes().filter((shape) => shape.type === "draw" || shape.type === "highlight").map((shape) => {
    const bounds = pageBounds(shape);
    const rawPoints = Array.isArray(shape.props.pts) ? shape.props.pts : [];
    const points = [];
    for (let index = 0; index + 1 < rawPoints.length; index += 3) {
      const x = rawPoints[index], y = rawPoints[index + 1];
      if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) points.push({ x, y });
    }
    return { id: shape.id, type: shape.type, bounds: { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h }, points };
  });
  const groups = groupCanvasInkStrokesForOCR(records, { mathMode: scientificObjects.length === 0 && records.length > 0 && editor.store.shapes().every((shape) => shape.type === "draw" || shape.type === "highlight") });
  const relevanceBounds = [
    ...editor.store.shapes().filter((shape) => shape.type !== "draw" && shape.type !== "highlight").map((shape) => {
      const bounds = pageBounds(shape);
      return { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h };
    }),
    ...scientificObjects.filter((object) => [object.x, object.y, object.width, object.height].every(Number.isFinite)).map(({ x, y, width, height }) => ({ x, y, width, height })),
  ];
  const selection = selectCanvasOCRGroups(groups, { records, relevanceBounds, selectedIds, limit: clampOCRRegionLimit(import.meta.env.VITE_CANVAS_OCR_MAX_REGIONS, CANVAS_OCR_MAX_REGIONS_PER_ANALYSIS) });
  const plans = planCanvasOCRCrops(selection.selected, { padding: CANVAS_OCR_DEFAULT_PADDING, pixelsPerWorld: 2 });
  const regions: OCRImageRegion[] = [];
  for (const plan of plans) {
    try {
      const image = await editor.exportImage({ ids: new Set(plan.sourceIds), background: true, scale: 2, margin: CANVAS_OCR_DEFAULT_PADDING });
      if (!image || image.type !== "image/png") continue;
      const bitmap = await createImageBitmap(image);
      const pixelWidth = bitmap.width, pixelHeight = bitmap.height;
      bitmap.close();
      regions.push({
        id: plan.id,
        base64: await blobToBase64(image),
        mimeType: "image/png",
        worldBounds: plan.worldBounds,
        cropBounds: plan.cropBounds,
        sourceIds: plan.sourceIds,
        pixelWidth,
        pixelHeight,
        pixelToWorld: canvasOCRRegionTransform(plan.cropBounds, pixelWidth, pixelHeight),
      });
    } catch {
      // a single bad region should not abandon the rest of the capture
    }
  }
  return regions;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
