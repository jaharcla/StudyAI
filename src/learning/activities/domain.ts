export function chooseActivityDomain(text: string): "force" | "graph" | null {
  const lower = text.toLowerCase();
  const forceKeywords = ["force", "acceleration", "vector"];
  const graphKeywords = ["slope", "linear", "graph"];
  const hasForce = forceKeywords.some((keyword) => new RegExp(`\\b${keyword}\\b`, "i").test(lower));
  const hasGraph = graphKeywords.some((keyword) => new RegExp(`\\b${keyword}\\b`, "i").test(lower));
  if (hasForce) return "force";
  if (hasGraph) return "graph";
  return null;
}