import type { CanvasAIContext, CanvasShapeContext } from "../src/canvas/ai/canvas-context.js";

function compactShape(shape: CanvasShapeContext) {
  return {
    id: shape.id,
    type: shape.type,
    position: shape.position,
    bounds: shape.bounds,
    ...(shape.geometry ? { geometry: shape.geometry } : {}),
    ...(shape.text ? { text: shape.text } : {}),
    ...(shape.arrow ? {
      arrow: {
        from: shape.arrow.from,
        to: shape.arrow.to,
        bend: shape.arrow.bend,
        length: shape.arrow.length,
        label: shape.arrow.label,
        labels: shape.arrow.labels,
        startAttached: shape.arrow.startAttached,
        endAttached: shape.arrow.endAttached,
        unattached: shape.arrow.unattached,
      },
    } : {}),
    ...(shape.strokeSummary ? { strokeSummary: shape.strokeSummary } : {}),
  };
}

// Keep the geometry the model needs to pair labels with shapes. The presentation
// layer below strips raw coordinates before the prompt, but keeps human-readable
// directions and relationships.
export function compactTutorShapes(context: CanvasAIContext) {
  return {
    scope: context.scope,
    selected: context.selected.map(compactShape),
    visible: context.visible.map(compactShape),
    nearbyObjects: context.nearbyObjects,
    spatialRelationships: context.spatialRelationships,
    truncated: context.truncated,
  };
}
