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

const LATEX_COMMANDS: Record<string, string> = {
  "\\sum": "sum", "\\prod": "prod", "\\int": "int", "\\frac": "frac", "\\sqrt": "sqrt",
  "\\partial": "partial", "\\nabla": "nabla", "\\infty": "infty", "\\cdot": "cdot",
  "\\times": "times", "\\div": "div", "\\pm": "pm", "\\mp": "mp", "\\le": "le", "\\ge": "ge",
  "\\ne": "ne", "\\approx": "approx", "\\equiv": "equiv", "\\in": "in", "\\notin": "notin",
  "\\subset": "subset", "\\cup": "cup", "\\cap": "cap", "\\to": "to", "\\rightarrow": "rightarrow",
  "\\leftarrow": "leftarrow", "\\Rightarrow": "Rightarrow", "\\langle": "langle", "\\rangle": "rangle",
  "\\alpha": "alpha", "\\beta": "beta", "\\gamma": "gamma", "\\delta": "delta", "\\epsilon": "epsilon",
  "\\varepsilon": "epsilon", "\\theta": "theta", "\\lambda": "lambda", "\\mu": "mu", "\\sigma": "sigma",
  "\\phi": "phi", "\\omega": "omega", "\\pi": "pi", "\\Delta": "delta", "\\Sigma": "sigma",
};

export function normalizeLatex(value: string): string {
  let text = String(value ?? "").normalize("NFKC");
  for (const [command, replacement] of Object.entries(LATEX_COMMANDS)) text = text.replaceAll(command, ` ${replacement} `);
  return text
    .replace(/\\(?:left|right|big|Big|bigg|Bigg)\b/g, " ")
    .replace(/\\(?:mathrm|mathbf|mathit|text|operatorname)\s*\{([^{}]*)\}/g, " $1 ")
    .replace(/\\([a-zA-Z]+)/g, " $1 ")
    .replace(/[${}^_&\\]/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function scoreMathOCR(expected: string, actual: string) {
  const normalizedExpected = normalizeLatex(expected);
  const normalizedActual = normalizeLatex(actual);
  const expectedTokens = normalizedExpected.split(" ").filter(Boolean);
  const actualTokens = normalizedActual.split(" ").filter(Boolean);
  const expectedSet = new Set(expectedTokens);
  const actualSet = new Set(actualTokens);
  let hits = 0;
  for (const token of expectedSet) if (actualSet.has(token)) hits++;
  const precision = actualSet.size ? hits / actualSet.size : 0;
  const recall = expectedSet.size ? hits / expectedSet.size : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    exact: normalizedExpected === normalizedActual,
    tokenF1: Number(f1.toFixed(3)),
    precision: Number(precision.toFixed(3)),
    recall: Number(recall.toFixed(3)),
    expectedTokens: expectedTokens.length,
    actualTokens: actualTokens.length,
    hits,
  };
}

export function scoreKeywordCoverage(keywords: readonly string[], text: string) {
  const normalized = String(text ?? "").toLowerCase();
  const matched = keywords.filter((keyword) => normalized.includes(keyword.toLowerCase()));
  return { matched, total: keywords.length, rate: keywords.length ? Number((matched.length / keywords.length).toFixed(3)) : 0 };
}

export function scoreConceptCoverage(concepts: readonly string[], text: string) {
  const normalized = String(text ?? "").toLowerCase();
  const matched = concepts.filter((concept) => {
    const value = concept.toLowerCase();
    if (value.length > 1) return normalized.includes(value);
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(normalized);
  });
  return { matched, total: concepts.length, rate: concepts.length ? Number((matched.length / concepts.length).toFixed(3)) : 0 };
}
