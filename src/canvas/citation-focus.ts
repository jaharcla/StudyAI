/** A canvas citation is the only citation grammar that targets board content.
 * Document refs are handled by parseSourceReference, never by this parser. */
export type CanvasCitation = { scope: "quickdraw" | "science"; id: string };

export function parseCanvasCitation(sourceRef: string): CanvasCitation | undefined {
  const match = /^(quickdraw|science):([A-Za-z0-9:_-]{3,120})$/.exec(sourceRef.trim());
  if (!match) return undefined;
  return { scope: match[1] as CanvasCitation["scope"], id: match[2] };
}
