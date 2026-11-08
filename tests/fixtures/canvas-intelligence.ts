export const syntheticCanvasFixtures = [
  { id: "word-near-shape", records: [{ id: "circle-1", type: "ellipse", bounds: { x: 0, y: 0, width: 40, height: 40 } }, { id: "label-1", type: "draw", bounds: { x: 48, y: 4, width: 55, height: 22 } }], imageText: "mass" },
  { id: "force-arrows", records: [{ id: "body", type: "rect", bounds: { x: 80, y: 80, width: 50, height: 50 } }, { id: "arrow-up", type: "arrow", bounds: { x: 100, y: 10, width: 4, height: 70 } }, { id: "arrow-right", type: "arrow", bounds: { x: 130, y: 100, width: 70, height: 4 } }], imageText: "Fₙ, Fₐ" },
  { id: "ambiguous-label", records: [{ id: "vector-1", type: "arrow", bounds: { x: 5, y: 5, width: 90, height: 30 } }], imageText: "l / 1" },
];

export const expectedCanvasInterpretations: Record<string, unknown> = {
  "word-near-shape": { transcription: "mass", association: ["circle-1", "label-1"] },
  "force-arrows": { directions: ["up", "right"], association: ["body", "arrow-up", "arrow-right"] },
  "ambiguous-label": { alternatives: ["l", "1"], uncertain: true },
};
