export function shouldRetrieveCourseDocuments(query: string): boolean {
  const text = query.trim();
  if (!text || isExactOutputRequest(text) || greetingOnly(text) || canvasDescriptionOnly(text) || canvasFirstWithoutSource(text)) return false;
  return /\b(?:according to|based on|from (?:the |my )?(?:course|lecture|textbook|notes|document|pdf|slides)|course|lecture|textbook|study guide|explain|define|calculate|solve|derive|prove|compare|summari[sz]e|analy[sz]e|evaluate|interpret|practice|teach me|show (?:your )?work|work through|what is|what are|why|how|which|whether)\b/i.test(text);
}

export function isExactOutputRequest(query: string): boolean {
  return exactOutputRequest(query);
}

export function requestsCanvasAction(query: string): boolean {
  if (/\b(?:propose_canvas_(?:edit|action)|get_canvas_state)\b/i.test(query)) return true;
  const text = query.trim();
  const questionStart = /^(?:what|which|why|how|when|where|who|is|are|does|do|can|could|would|should)\b/i.test(text);
  const requestPhrase = /\b(?:can you|could you|would you|please|i want you to|i need you to|help me|go ahead|let's)\b/i.test(text);
  if (questionStart && !requestPhrase) return false;
  const canvasNoun = /\b(?:canvas|board|shape|shapes|arrow|arrows|line|lines|text|label|labels|note|notes|diagram|selection)\b/i;
  for (const match of text.matchAll(/\b(?:draw|create|add|edit|change|move|delete|highlight|annotate|select|correct|fix|show me where)\b/gi)) {
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 48), index);
    if (/\b(?:do not|don't|dont|never|without|not to|no need to)(?:\s+(?:please|the|a|an|my|any|canvas|board|make|perform|apply|change|changes|edit|edits))*\s*$/i.test(before)) continue;
    const atStart = /^\s*$/.test(before);
    const after = text.slice(index, index + 80);
    if (atStart || canvasNoun.test(after) || canvasNoun.test(before.slice(-40))) return true;
  }
  return false;
}

/**
 * Deterministic tool retrieval. Returns the tool names most relevant to the
 * current request so the model can be given a short, query-specific routing
 * hint. This never removes a tool from the bound tool set — it only decides
 * which tools are named in the system prompt.
 */
const TOOL_ROUTES: Array<{ test: RegExp; names: string[] }> = [
  { test: /\b(?:handwriting|handwritten|ink|transcribe|read the (?:writing|ink|text))\b/i, names: ["read_canvas_ink"] },
  { test: /\b(?:near|overlap(?:ping|s)?|spatial|nearby|adjacent|connected to|relationship between)\b/i, names: ["get_canvas_scene"] },
  { test: /\b(?:shape|shapes|arrow|arrows|line|lines|text box|rectangle|ellipse|highlight|select)\b/i, names: ["get_canvas_state", "propose_canvas_action"] },
  { test: /\b(?:edit|change|modify|correct|fix|update|remove|delete|rename|set the|make the)\b/i, names: ["propose_canvas_edit"] },
  { test: /\b(?:molecule|lewis|bond|atom|formula|c2h4|ethylene)\b/i, names: ["propose_molecule"] },
  { test: /\b(?:vector|force|equation|graph|concept|flashcard|measurement|anatomy|linked note|linked document|practice question)\b/i, names: ["propose_scientific_object"] },
  { test: /\b(?:line|circle|ellipse|arrow|rectangle|triangle|diamond|hexagon|star|shape|text|note|draw|sketch|drawing)\b/i, names: ["propose_canvas_action"] },
  { test: /\b(?:add|create|place|insert|put|make)\b/i, names: ["propose_scientific_object"] },
  { test: /\b(?:search|find|across (?:my |the )?(?:boards|course)|evidence|label)\b/i, names: ["search_canvas_evidence", "describe_canvas"] },
  { test: /\b(?:according to|based on|from (?:the |my )?(?:lecture|course|notes|document|pdf|slides)|cite|source)\b/i, names: ["search_course_documents"] },
  { test: /\b(?:verify|fact.?check|is it true|claimed)\b/i, names: ["search_fact_checks"] },
];

export function recommendedToolsForQuery(query: string, available: readonly string[]): string[] {
  const present = new Set(available);
  const found: string[] = [];
  // A tool named verbatim by the user is a direct instruction. Honor it before
  // keyword routes that might otherwise suggest a different tool for the same
  // noun (for example "vector" routing to propose_scientific_object).
  for (const name of [
    "propose_canvas_edit", "propose_canvas_action", "propose_scientific_object",
    "propose_molecule", "get_canvas_state", "get_canvas_scene", "read_canvas_ink",
    "search_canvas_evidence", "describe_canvas", "search_course_documents",
  ]) {
    if (present.has(name) && new RegExp(`\\b${name}\\b`, "i").test(query)) found.push(name);
  }
  for (const route of TOOL_ROUTES) {
    if (!route.test.test(query)) continue;
    for (const name of route.names) {
      if (present.has(name) && !found.includes(name)) found.push(name);
    }
  }
  return found.slice(0, 3);
}

export function requestsCanvasMetadata(query: string): boolean {
  if (requestsCanvasAction(query)) return true;
  if (/\b(?:don't|do not|dont|never|without|no need to|not)\b[^.!?]{0,48}\b(?:ids?|identifiers?|coordinates?|bounds?|bounding boxes|raw json|metadata|diagnostics?)\b/i.test(query)) return false;
  return /\b(?:shape|object|board|canvas)\s+(?:ids?|identifiers?|coordinates?|bounds?|bounding boxes)\b|\b(?:coordinates?|bounding boxes|retrieval scores?|raw json|debug metadata|tool output|object ids?)\b/i.test(query);
}

function exactOutputRequest(query: string): boolean {
  return /\b(?:reply|respond|answer|say|write|output)\b[^.!?]{0,64}\bexactly\b/i.test(query)
    || /\bexactly\s*:/i.test(query);
}

function greetingOnly(query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase().replace(/[.!?,;:]+$/g, "").replace(/\s+/g, " ");
  return /^(?:hi|hello|hey|good morning|good afternoon|good evening|how are you)(?: there| tutor| studyai)?$/.test(normalized);
}

function canvasDescriptionOnly(query: string): boolean {
  const hasCanvas = /\b(?:board|canvas|diagram|drawing|sketch)\b/i.test(query);
  const describesCanvas = /\b(?:what(?:'s| is) (?:on|in)|tell me what (?:is|you can see) (?:on|in)|what do you see (?:on|in)|what can you see (?:on|in)|describe|read)\b/i.test(query);
  const asksForAcademicInterpretation = /\b(?:explain|interpret|calculate|solve|derive|why|how|according to|based on|from the lecture)\b/i.test(query);
  return hasCanvas && describesCanvas && !asksForAcademicInterpretation;
}

function canvasFirstWithoutSource(query: string): boolean {
  return /\b(?:canvas|board|diagram|drawing|sketch)\b/i.test(query)
    && !/\b(?:according to|based on|from (?:the |my )?(?:course|lecture|textbook|notes|document|pdf|slides)|course|lecture|textbook|study guide)\b/i.test(query);
}
