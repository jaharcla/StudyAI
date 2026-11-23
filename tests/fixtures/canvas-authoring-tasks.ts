import type { LayoutRect } from "../../src/canvas/ai/layout";

/** Small scored corpus for the author_board metrics. Board states are explicit so legality is deterministic. */
export type CanvasAuthoringTask = {
  id: string;
  brief: Record<string, unknown>;
  occupancy: LayoutRect[];
  expected: { kinds: string[]; sourceRefs: string[] };
};

const viewport: LayoutRect = { x: 0, y: 0, width: 4000, height: 3000 };
export const authoringViewport = viewport;

const friction = {
  boardId: "board-metrics", topic: "friction from module 1",
  artifact: {
    kind: "question", count: 1, prompt: "Name the three forces on the block.",
    answer: "Gravity, the normal force and friction.", citationLabel: "Module 1 · p. 4",
    concepts: ["friction", "free-body diagram"],
    figure: { kind: "freebody", title: "Forces on the block", forces: [
      { label: "gravity", components: [0, -9.8] },
      { label: "normal", components: [3, 5] },
      { label: "friction", components: [-4, 0] },
    ] },
  },
  placement: { relation: "clear-area" },
  sourceRefs: ["studyai://document/module-1/text/4?chunk=0"],
  reason: "Scored friction authoring task.",
};

const problemPrompts = [
  "State the friction direction for a block on a slope.",
  "Name the force perpendicular to the slope.",
  "Which force points vertically downward?",
  "If the block slides down, which way does friction act?",
  "What happens to the normal force when the slope steepens?",
  "Which component of gravity pulls the block downhill?",
  "Draw the three forces acting on the block.",
  "How would the forces change on a frictionless slope?",
];

export const canvasAuthoringTasks: CanvasAuthoringTask[] = [
  { id: "friction-empty", brief: friction, occupancy: [], expected: { kinds: ["question", "force", "force", "force"], sourceRefs: friction.sourceRefs } },
  {
    id: "friction-reuse", brief: friction,
    occupancy: [{ x: 100, y: 100, width: 700, height: 480 }],
    expected: { kinds: ["question", "force", "force", "force"], sourceRefs: friction.sourceRefs },
  },
  {
    id: "problem-set-eight", brief: {
      ...friction,
      artifact: {
        ...friction.artifact, kind: "problem-set", count: 8, prompt: problemPrompts[0], figure: undefined,
        items: problemPrompts.map((prompt) => ({ prompt, sourceRef: friction.sourceRefs[0] })),
      },
    },
    occupancy: [{ x: 100, y: 100, width: 500, height: 300 }],
    expected: { kinds: Array(8).fill("question"), sourceRefs: friction.sourceRefs },
  },
  {
    id: "graph-figure", brief: {
      ...friction,
      artifact: { ...friction.artifact, kind: "figure", figure: { kind: "graph", title: "y = x^2", expression: "x^2", xRange: [-2, 2] } },
    },
    occupancy: [],
    expected: { kinds: ["graph"], sourceRefs: friction.sourceRefs },
  },
  {
    id: "vector-figure", brief: {
      ...friction,
      artifact: { ...friction.artifact, kind: "figure", figure: { kind: "vector", title: "Applied force", vector: { components: [3, 4, 0], units: "N" } } },
    },
    occupancy: [],
    expected: { kinds: ["vector"], sourceRefs: friction.sourceRefs },
  },
];
