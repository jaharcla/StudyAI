const expected = { fn: "arrow-up", fa: "arrow-right", mg: "arrow-down" };
const obj = (value: unknown): Record<string, any> => value && typeof value === "object" ? value as Record<string, any> : {};
const norm = (value: unknown) => String(value ?? "").toLowerCase().replaceAll("ₙ", "n").replaceAll("ₐ", "a").replace(/[^a-z0-9]+/g, "");

export function scoreCanvasLiveOutput(value: unknown) {
  const root = obj(value), ocrItems = Array.isArray(root.ocr?.items) ? root.ocr.items : undefined;
  const recognition = ocrItems ? Object.fromEntries(Object.entries(expected).map(([label]) => [label, ocrItems.some((item: unknown) => norm(obj(item).text) === label)])) : undefined;
  const mappings = root.reasoning?.labels ?? root.labels;
  const mapped = Array.isArray(mappings) ? Object.fromEntries(Object.entries(expected).map(([label, arrowId]) => [label, mappings.some((item: unknown) => norm(obj(item).text) === label && obj(item).arrowId === arrowId)])) : Object.fromEntries(Object.keys(expected).map((label) => [label, false]));
  if (Array.isArray(root.fusion?.associations)) for (const [label, arrowId] of Object.entries(expected)) mapped[label] ||= root.fusion.associations.some((item: unknown) => obj(item).sourceIds?.includes(arrowId) && norm(obj(item).description).includes(label));
  const directions = root.arrowDirections ?? root.reasoning?.arrowDirections;
  const geometryDirections = Array.isArray(directions) ? Object.fromEntries([["arrow-up", "up"], ["arrow-right", "right"], ["arrow-down", "down"]].map(([id, direction]) => [id, directions.some((item: unknown) => obj(item).arrowId === id && obj(item).direction === direction)])) : Object.fromEntries([["arrow-up", "up"], ["arrow-right", "right"], ["arrow-down", "down"]].map(([id, direction]) => [id, root.structure?.observations?.some((item: unknown) => obj(item).sourceIds?.includes(id) && norm(obj(item).description).includes(direction)) ?? false]));
  const uncertainties = [...(Array.isArray(root.uncertainties) ? root.uncertainties : []), ...(Array.isArray(root.fusion?.uncertainties) ? root.fusion.uncertainties : []), ...(Array.isArray(root.reasoning?.uncertainties) ? root.reasoning.uncertainties : [])].map(norm).join(" ");
  const uncertaintyHandling = ocrItems ? /uncertain|lack|without|no explicit|position|association/.test(uncertainties + " " + norm(root.answer ?? root.reasoning?.answer)) : null;
  const answer = norm(root.answer ?? root.reasoning?.answer);
  const answerDirections = ["up", "right", "down"].every((direction) => answer.includes(direction));
  const all = (record: Record<string, boolean> | undefined) => !!record && Object.values(record).every(Boolean);
  return { transcriptionCoverage: recognition ? all(recognition) : null, labelAssociations: all(mapped), geometryDirections: all(geometryDirections), finalAnswerDirectionAccuracy: answerDirections, uncertaintyHandling };
}
