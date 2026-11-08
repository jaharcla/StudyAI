export function requireCanvasRevision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error("A current canvas revision is required.");
}

export function assertCanvasRevision(expected: unknown, current: unknown): asserts current is number {
  requireCanvasRevision(expected);
  requireCanvasRevision(current);
  if (expected !== current) throw new Error("This proposal is stale. The board changed after it was created.");
}
