export type RenderedObject = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
};

export type RenderSnapshot = {
  objects: RenderedObject[];
  pngSha256?: string;
};

export type RenderFidelityMetrics = {
  maxGeometryDrift: number;
  missingObjects: string[];
  duplicatedObjects: string[];
  exportDelta: number | null;
  displayedMatchesPersisted: boolean;
  recoveredAfterReconnect: boolean | null;
  reproducible: boolean;
};

// StudyAI-appropriate tolerance: sub-pixel/rounding drift is acceptable;
// byte-identical PNGs across engines are explicitly not required.
export const GEOMETRY_TOLERANCE_PX = 1;

export function compareRenders(
  baseline: RenderSnapshot,
  observed: RenderSnapshot,
  options: {
    displayedMatchesPersisted?: boolean;
    recoveredAfterReconnect?: boolean;
  } = {}
): RenderFidelityMetrics {
  const baselineById = new Map(baseline.objects.map((o) => [o.id, o]));
  const counts = new Map<string, number>();
  for (const o of observed.objects) counts.set(o.id, (counts.get(o.id) ?? 0) + 1);

  const missingObjects = baseline.objects
    .filter((o) => !counts.has(o.id))
    .map((o) => o.id);
  const duplicatedObjects = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  let maxGeometryDrift = 0;
  for (const o of observed.objects) {
    const original = baselineById.get(o.id);
    if (!original) continue;
    for (const key of ["x", "y", "w", "h"] as const) {
      maxGeometryDrift = Math.max(
        maxGeometryDrift,
        Math.abs(o[key] - original[key])
      );
    }
  }

  const exportDelta =
    baseline.pngSha256 !== undefined && observed.pngSha256 !== undefined
      ? baseline.pngSha256 === observed.pngSha256
        ? 0
        : 1
      : null;

  return {
    maxGeometryDrift,
    missingObjects,
    duplicatedObjects,
    exportDelta,
    displayedMatchesPersisted:
      options.displayedMatchesPersisted ??
      (missingObjects.length === 0 && duplicatedObjects.length === 0),
    recoveredAfterReconnect: options.recoveredAfterReconnect ?? null,
    reproducible:
      missingObjects.length === 0 &&
      duplicatedObjects.length === 0 &&
      maxGeometryDrift <= GEOMETRY_TOLERANCE_PX,
  };
}
