import { BoundingBox, LayoutResolutionResult, LayoutTarget } from "../../server/canvas/spatial-types";

function checkAABBOverlap(a: BoundingBox, b: BoundingBox, padding = 10): boolean {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

export class LayoutConstraintSolver {
  static resolveCollisions(
    existingNodes: BoundingBox[],
    proposedTargets: LayoutTarget[],
    maxIterations = 50,
    padding = 15
  ): LayoutResolutionResult {
    const resolved: BoundingBox[] = proposedTargets.map((t) => ({ ...t.suggestedBounds }));
    const displacements = proposedTargets.map(() => ({ x: 0, y: 0 }));
    let hasCollisions = false;
    let iteration = 0;

    for (; iteration < maxIterations; iteration++) {
      let collisionDetectedThisPass = false;

      for (let i = 0; i < resolved.length; i++) {
        if (proposedTargets[i].pinned) continue;

        for (const existing of existingNodes) {
          if (checkAABBOverlap(resolved[i], existing, padding)) {
            collisionDetectedThisPass = true;
            hasCollisions = true;

            const overlapX =
              resolved[i].x < existing.x
                ? existing.x - (resolved[i].x + resolved[i].width + padding)
                : existing.x + existing.width + padding - resolved[i].x;

            const overlapY =
              resolved[i].y < existing.y
                ? existing.y - (resolved[i].y + resolved[i].height + padding)
                : existing.y + existing.height + padding - resolved[i].y;

            if (Math.abs(overlapX) < Math.abs(overlapY)) {
              resolved[i].x += overlapX;
              displacements[i].x += overlapX;
            } else {
              resolved[i].y += overlapY;
              displacements[i].y += overlapY;
            }
          }
        }
      }

      if (!collisionDetectedThisPass) break;
    }

    return {
      resolvedBounds: resolved,
      displacements,
      hasCollisions,
      iterations: iteration,
    };
  }
}
