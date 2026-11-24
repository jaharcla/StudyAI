import type { InfographicDiagram } from "./api";

export type InfographicArrow = {
  label: string;
  x1: number; y1: number; x2: number; y2: number;
  lx: number; ly: number;
  color: string;
};

export type InfographicFigure = {
  width: number;
  height: number;
  center: { x: number; y: number };
  arrows: InfographicArrow[];
  angleDeg?: number;
};

const PALETTE = ["#b45309", "#2563eb", "#15803d", "#7c3aed", "#be123c", "#0f766e", "#a16207", "#4338ca"];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Pure, deterministic local layout for a diagram-based infographic. No provider, no
 * randomness, no board access: the same diagram always produces the same figure.
 */
export function buildInfographicFigure(diagram: InfographicDiagram): InfographicFigure {
  const width = 640;
  const height = 360;
  const center = { x: 320, y: 184 };
  const arrows = diagram.forces.map((force, index) => {
    const [fx, fy] = force.components;
    const magnitude = Math.hypot(fx, fy) || 1;
    const length = clamp(magnitude * 14, 30, 112);
    const x1 = force.position ? clamp(center.x + force.position.x / 4, 40, width - 40) : center.x;
    const y1 = force.position ? clamp(center.y - force.position.y / 4, 40, height - 40) : center.y;
    const x2 = clamp(x1 + (fx / magnitude) * length, 14, width - 14);
    const y2 = clamp(y1 - (fy / magnitude) * length, 14, height - 14);
    return {
      label: force.label,
      x1, y1, x2, y2,
      lx: clamp((x1 + x2) / 2 + 9, 12, width - 100),
      ly: clamp((y1 + y2) / 2 - 9, 20, height - 12),
      color: PALETTE[index % PALETTE.length] ?? PALETTE[0]!,
    };
  });
  return {
    width, height, center, arrows,
    ...(diagram.surfaceAngleDeg === undefined ? {} : { angleDeg: diagram.surfaceAngleDeg }),
  };
}
