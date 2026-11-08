import type { ToolId } from "@quickdrawjs/react";
import type { ScientificObject } from "./model";

export type CanvasTool =
  | { id: string; label: string; description: string; group: "Draw"; action: "quickdraw"; tool: ToolId }
  | { id: ScientificObject["kind"]; label: string; description: string; group: "Science" | "Learning"; action: "object" };

export const canvasTools: CanvasTool[] = [
  { id: "select", label: "Select and move", description: "Select, resize, and delete drawing shapes.", group: "Draw", action: "quickdraw", tool: "select" },
  { id: "hand", label: "Pan canvas", description: "Move around the infinite canvas.", group: "Draw", action: "quickdraw", tool: "hand" },
  { id: "draw", label: "Freehand pen", description: "Draw with pressure ink.", group: "Draw", action: "quickdraw", tool: "draw" },
  { id: "geo", label: "Shapes", description: "Insert editable geometric shapes.", group: "Draw", action: "quickdraw", tool: "geo" },
  { id: "arrow", label: "Arrow", description: "Draw an arrow between ideas.", group: "Draw", action: "quickdraw", tool: "arrow" },
  { id: "text", label: "Text", description: "Add a text label.", group: "Draw", action: "quickdraw", tool: "text" },
  { id: "molecule", label: "Lewis structure", description: "Place atoms, connect bonds, and manipulate a Lewis structure on the canvas.", group: "Science", action: "object" },
  { id: "vector", label: "Vector", description: "Drag an arrow, move endpoints, or inspect its components.", group: "Science", action: "object" },
  { id: "force", label: "Force", description: "Drag a force from its point of application; calibrate units in the inspector.", group: "Science", action: "object" },
  { id: "equation", label: "Equation", description: "Keep an editable equation and variable values.", group: "Science", action: "object" },
  { id: "measurement", label: "Measurement", description: "Store a measured value and its units.", group: "Science", action: "object" },
  { id: "graph", label: "Graph data", description: "Keep plotted coordinates as numeric data.", group: "Science", action: "object" },
  { id: "anatomy", label: "Anatomy label", description: "Link a canvas label to a biological structure identifier.", group: "Science", action: "object" },
  { id: "concept", label: "Concept", description: "Add a course concept with a definition.", group: "Learning", action: "object" },
  { id: "relationship", label: "Relationship", description: "Connect two structured canvas objects.", group: "Learning", action: "object" },
  { id: "linked-note", label: "Link a note", description: "Place a saved course note on this board.", group: "Learning", action: "object" },
  { id: "linked-document", label: "Link a document", description: "Place a course document reference on this board.", group: "Learning", action: "object" },
  { id: "question", label: "Practice question", description: "Add a question linked to a course concept.", group: "Learning", action: "object" },
  { id: "flashcard", label: "Flashcard", description: "Create a two-sided learning card.", group: "Learning", action: "object" },
];
