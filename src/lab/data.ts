// Shared demo content for the design-lab prototypes.
// This is throwaway material for comparing layouts — not product data.

export const course = { title: "DEMO Motion", code: "DEMO-MOTION", color: "#b3643a" };
export const lesson = {
  title: "Vectors in equilibrium",
  description: "Study materials, notes, and canvas for Vectors in equilibrium.",
  eyebrow: "LESSON 04 · FORCES",
};

export const courses = [
  { title: "DEMO Motion", code: "DEMO-MOTION", color: "#b3643a", lessons: 6 },
  { title: "DEMO Chemistry", code: "DEMO-CHEM", color: "#5f8a6b", lessons: 12 },
  { title: "DEMO Mathematics", code: "DEMO-MATH", color: "#c9a227", lessons: 9 },
  { title: "CHEM 120", code: "CHEM-120", color: "#7a6fb5", lessons: 14 },
  { title: "Grounded force", code: "RECOGNITION", color: "#4b8b8b", lessons: 3 },
];

export const boards = [
  { name: "Demo board", objects: 12, updated: "2 min ago" },
  { name: "Force diagrams", objects: 8, updated: "Yesterday" },
  { name: "Exam prep · vectors", objects: 21, updated: "3 days ago" },
];

export const tools = [
  { label: "Select and move", key: "S", group: "Draw" },
  { label: "Pan canvas", key: "P", group: "Draw" },
  { label: "Freehand pen", key: "F", group: "Draw" },
  { label: "Shapes", key: "S", group: "Draw" },
  { label: "Arrow", key: "A", group: "Draw" },
  { label: "Text", key: "T", group: "Draw" },
  { label: "Lewis structure", key: "", group: "Science" },
  { label: "Vector", key: "+", group: "Science" },
  { label: "Force", key: "+", group: "Science" },
  { label: "Equation", key: "+", group: "Science" },
  { label: "Measurement", key: "+", group: "Science" },
  { label: "Graph data", key: "+", group: "Science" },
];

export const suggestions = [
  "Work through the equilibrium example",
  "Explain the forces on this board",
  "Quiz me on the course excerpt",
];

export const objects = [
  { type: "vector", label: "Force vector", detail: "F⃗ = (4.2, −1.8) N", x: 12, y: 18 },
  { type: "note", label: "Observation", detail: "Horizontal components cancel at rest.", x: 58, y: 12 },
  { type: "equation", label: "Equation", detail: "ΣF⃗ = m·a⃗ = 0", x: 34, y: 52 },
];

export const progress = { lessons: 18, total: 44, streak: 6, hours: 12.5 };
