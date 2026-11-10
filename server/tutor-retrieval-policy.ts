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
  for (const match of query.matchAll(/\b(?:draw|create|add|edit|change|move|delete|highlight|annotate|select|correct|fix|show me where)\b/gi)) {
    const before = query.slice(Math.max(0, (match.index ?? 0) - 48), match.index);
    if (/\b(?:do not|don't|dont|never|without|not to|no need to)(?:\s+(?:please|the|a|an|my|any|canvas|board|make|perform|apply|change|changes|edit|edits))*\s*$/i.test(before)) continue;
    return true;
  }
  return false;
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
