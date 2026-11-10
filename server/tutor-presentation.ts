export type TutorCitationCandidate = {
  sourceRef: string;
  filename: string;
  unitType: string;
  unitNumber: number;
  score?: number;
  excerpt?: string;
};

export type TutorCitation = Pick<TutorCitationCandidate, "sourceRef" | "filename" | "unitType" | "unitNumber">;
export type TutorStudentResponse = { answer: string; citations: TutorCitation[]; rejectedCitationCount: number };
export type TutorContextItem = { description: string; value: unknown };

export function presentTutorResponse(answer: string, candidates: readonly TutorCitationCandidate[]): TutorStudentResponse {
  const candidateByRef = new Map(candidates.map((candidate) => [candidate.sourceRef, candidate]));
  const citations = new Map<string, TutorCitation>();
  let rejectedCitationCount = 0;
  const renderCitation = (sourceRef: string): string | undefined => {
    const candidate = candidateByRef.get(sourceRef);
    if (!candidate) return undefined;
    const citation = {
      sourceRef: candidate.sourceRef,
      filename: candidate.filename,
      unitType: candidate.unitType,
      unitNumber: candidate.unitNumber,
    };
    citations.set(sourceRef, citation);
    return `[${markdownLabel(citation.filename + " · " + citationLocation(citation))}](#studyai-citation=${encodeURIComponent(sourceRef)})`;
  };
  const renderReference = (reference: string): string | undefined => {
    if (candidateByRef.has(reference)) return renderCitation(reference);
    try {
      const url = new URL(reference);
      if (url.origin !== "https://studyai.org" || !url.pathname.startsWith("/document/")) return undefined;
      const sourceRef = `studyai://document${url.pathname.slice("/document".length)}${url.search}`;
      return candidateByRef.has(sourceRef) ? renderCitation(sourceRef) : undefined;
    } catch {
      return undefined;
    }
  };
  const content = answer
    .replace(/(?:\[([^\]]*)\]|【([^】\]]*)[】\]])\(#studyai-citation=([^\)]+)\)/g, (_match, _squareLabel: string | undefined, _fullWidthLabel: string | undefined, encoded: string) => {
      let sourceRef: string;
      try { sourceRef = decodeURIComponent(encoded); } catch { rejectedCitationCount++; return ""; }
      const rendered = renderReference(sourceRef);
      if (!rendered) { rejectedCitationCount++; return ""; }
      return rendered;
    })
    .replace(/(?:\[([^\]]*)\]|【([^】\]]*)[】\]])\((studyai:\/\/document\/[^\)]+)\)/g, (_match, _squareLabel: string | undefined, _fullWidthLabel: string | undefined, sourceRef: string) => {
      const rendered = renderReference(sourceRef);
      if (!rendered) { rejectedCitationCount++; return ""; }
      return rendered;
    })
    .replace(/【([^】]*)\((https:\/\/studyai\.org\/document\/[^\)]+)\)】/g, (_match, _label: string, reference: string) => {
      const rendered = renderReference(reference);
      if (!rendered) { rejectedCitationCount++; return ""; }
      return rendered;
    })
    .replace(/(?:\[([^\]]*)\]|【([^】\]]*)[】\]])\((https:\/\/studyai\.org\/document\/[^\)]+)\)/g, (_match, _squareLabel: string | undefined, _fullWidthLabel: string | undefined, reference: string) => {
      const rendered = renderReference(reference);
      if (!rendered) { rejectedCitationCount++; return ""; }
      return rendered;
    })
    .replace(/【([^】]+)】/g, (match, reference: string) => {
      const rendered = renderReference(reference);
      if (rendered) return rendered;
      if (reference.startsWith("studyai://document/") || reference.startsWith("https://studyai.org/document/")) { rejectedCitationCount++; return ""; }
      return match;
    });
  const cleaned = rejectedCitationCount
    ? content.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.;!?])/g, "$1")
    : content;
  return { answer: cleaned, citations: [...citations.values()], rejectedCitationCount };
}

export function renderTutorResponse(response: TutorStudentResponse): string {
  return response.answer;
}

export function projectTutorContexts(contexts: TutorContextItem[], includeRawCanvasMetadata: boolean): TutorContextItem[] {
  if (includeRawCanvasMetadata) return contexts;

  const scienceContext = contexts.find((item) => item.description === "StudyAI active scientific canvas objects");
  const objects = list(record(scienceContext?.value).objects);
  const labels = scientificLabels(objects);
  return contexts.map((item) => {
    if (item.description === "StudyAI current workspace and structured canvas metadata") return { ...item, value: projectWorkspace(item.value) };
    if (item.description === "StudyAI active scientific canvas objects") return { ...item, value: projectScienceContext(item.value, labels) };
    if (item.description === "Active Quickdraw board context") return { ...item, value: projectQuickdrawContext(item.value, labels) };
    if (item.description === "StudyAI canvas analysis result") return { ...item, value: projectCanvasAnalysis(item.value) };
    return item;
  });
}

function projectWorkspace(value: unknown): Record<string, unknown> {
  const source = record(value);
  const canvas = record(source.canvas);
  return {
    ...pick(source, ["course", "courseCode", "lesson", "view"]),
    ...(source.canvas ? { canvas: pick(canvas, ["objectCount", "objectTypes"]) } : {}),
  };
}

function projectScienceContext(value: unknown, labels: Map<string, string>): Record<string, unknown> {
  const source = record(value);
  return {
    objects: list(source.objects).map((object) => projectScientificObject(object, labels)).filter(Boolean),
    ...(typeof source.freehand === "string" ? { freehand: "Freehand marks are uninterpreted; their meaning cannot be determined from shape alone." } : {}),
  };
}

function projectScientificObject(value: unknown, labels: Map<string, string>): Record<string, unknown> | null {
  const object = record(value);
  const kind = string(object.kind);
  if (!kind) return null;
  if (kind === "molecule") {
    const atoms = list(object.atoms).map(record);
    const counts = new Map<string, number>();
    const atomLabels = new Map<string, string>();
    const projectedAtoms = atoms.map((atom) => {
      const element = string(atom.element) ?? "atom";
      const index = (counts.get(element) ?? 0) + 1;
      counts.set(element, index);
      const label = `${element}${index}`;
      if (typeof atom.id === "string") atomLabels.set(atom.id, label);
      return { label, element, nonbondingElectrons: atom.nonbondingElectrons };
    });
    const active = list(object.resonanceForms).map(record).find((form) => form.id === object.activeResonanceId) ?? list(object.resonanceForms).map(record)[0];
    const bonds = active ? list(active.bonds).map(record).map((bond) => ({
      from: atomLabels.get(string(bond.from) ?? "") ?? "unknown atom",
      to: atomLabels.get(string(bond.to) ?? "") ?? "unknown atom",
      order: bond.order,
    })) : [];
    return { kind, name: object.name, atoms: projectedAtoms, bonds, ...(active ? { resonanceForm: active.name } : {}) };
  }
  if (kind === "atom") return pick(object, ["kind", "element", "nonbondingElectrons", "bondOrderSum", "label"]);
  if (kind === "bond") return { kind, label: object.label, from: labels.get(string(object.from) ?? "") ?? "an atom", to: labels.get(string(object.to) ?? "") ?? "an atom", order: object.order };
  if (kind === "equation") return { kind, expression: object.expression, variables: object.variables, ...(object.units ? { units: object.units } : {}), ...(object.result !== undefined ? { result: object.result } : {}), ...(object.mathWorkspace ? { mathWorkspace: projectMathWorkspace(object.mathWorkspace) } : {}) };
  if (kind === "graph") return pick(object, ["kind", "expression", "xRange", "xLabel", "yLabel", "points", "evaluationError"]);
  if (kind === "vector" || kind === "force") return pick(object, ["kind", "components", "units", "label"]);
  if (kind === "measurement") return pick(object, ["kind", "value", "units", "label"]);
  if (kind === "anatomy") return pick(object, ["kind", "system", "labels"]);
  if (kind === "concept") return pick(object, ["kind", "title", "definition"]);
  if (kind === "relationship") return { kind, label: object.label, from: labels.get(string(object.fromId) ?? "") ?? "one object", to: labels.get(string(object.toId) ?? "") ?? "another object" };
  if (kind === "linked-note" || kind === "linked-document") return pick(object, ["kind", "title", "excerpt"]);
  if (kind === "question") return pick(object, ["kind", "prompt", "answer"]);
  if (kind === "flashcard") return pick(object, ["kind", "front", "back"]);
  return { kind };
}

function projectMathWorkspace(value: unknown): Record<string, unknown> {
  const source = record(value);
  return {
    ...(typeof source.latex === "string" ? { latex: source.latex } : {}),
    ...(source.statement ? { statement: source.statement } : {}),
    ...(source.parameters ? { parameters: source.parameters } : {}),
    ...(source.assumptions ? { assumptions: source.assumptions } : {}),
    ...(source.domainRestrictions ? { domainRestrictions: source.domainRestrictions } : {}),
    ...(Array.isArray(source.verifiedSteps) ? { verifiedSteps: source.verifiedSteps.slice(-10) } : {}),
  };
}

function projectQuickdrawContext(value: unknown, labels: Map<string, string>): Record<string, unknown> {
  const source = record(value);
  const selected = list(source.selected);
  const visible = list(source.visible);
  const aliases = new Map<string, string>();
  const counters = new Map<string, number>();
  const projectShape = (shape: Record<string, unknown>) => {
    const type = string(shape.type) ?? "unknown";
    const count = (counters.get(type) ?? 0) + 1;
    counters.set(type, count);
    const text = string(shape.text)?.slice(0, 500);
    const alias = type === "text" || type === "note" ? `text label “${text ?? ""}”` : `${type} ${count}`;
    if (typeof shape.id === "string") aliases.set(shape.id, alias);
    if (type === "draw" || type === "highlight") return { kind: "freehand mark", observation: "The meaning cannot be determined from this freehand mark alone." };
    if (type === "text" || type === "note") return { kind: "text label", text: text ?? "" };
    const arrow = record(shape.arrow);
    const direction = type === "arrow" || type === "line" ? arrowDirection(arrow.from, arrow.to) : undefined;
    return { kind: type, ...(direction ? { direction } : {}), ...(Number(arrow.bend) ? { curved: true } : {}) };
  };
  const projectedSelected = selected.map((shape) => projectShape(record(shape)));
  const projectedVisible = visible.map((shape) => projectShape(record(shape)));
  const relationships = list(source.spatialRelationships).map(record).flatMap((relation) => {
    const from = aliases.get(string(relation.fromId) ?? "");
    const to = aliases.get(string(relation.toId) ?? "");
    const direction = string(relation.relation);
    return from && to && direction && ["left of", "right of", "above", "below", "overlaps", "touches"].includes(direction) ? [`${from} is ${direction} ${to}`] : [];
  });
  const nearbyObjects = list(source.nearbyObjects).map((item) => projectNearbyObject(item, labels)).filter(Boolean);
  return {
    selected: projectedSelected,
    visible: projectedVisible,
    nearbyObjects,
    spatialRelationships: relationships,
    ...(source.truncated === true ? { incomplete: true } : {}),
  };
}

function projectNearbyObject(value: unknown, labels: Map<string, string>): Record<string, unknown> | null {
  const item = record(value);
  const kind = string(item.kind);
  const detail = record(item.detail);
  if (!kind) return null;
  if (kind === "molecule") return { kind, name: detail.name, atomCount: detail.atomCount };
  if (kind === "bond") return { kind, label: detail.label, from: labels.get(string(detail.from) ?? "") ?? "an atom", to: labels.get(string(detail.to) ?? "") ?? "an atom", order: detail.order };
  if (kind === "equation") return { kind, expression: detail.expression, variables: detail.variables, ...(detail.units ? { units: detail.units } : {}) };
  if (kind === "graph") return pick({ kind, ...detail }, ["kind", "expression", "xRange", "xLabel", "yLabel", "pointCount"]);
  if (kind === "vector" || kind === "force") return pick({ kind, ...detail }, ["kind", "components", "units", "label"]);
  if (kind === "measurement") return pick({ kind, ...detail }, ["kind", "value", "units", "label"]);
  if (kind === "anatomy") return pick({ kind, ...detail }, ["kind", "system", "labels"]);
  if (kind === "concept") return pick({ kind, ...detail }, ["kind", "title", "definition"]);
  if (kind === "relationship") return { kind, label: detail.label };
  if (kind === "linked-note" || kind === "linked-document") return pick({ kind, ...detail }, ["kind", "title", "excerpt"]);
  if (kind === "question") return pick({ kind, ...detail }, ["kind", "prompt", "answer"]);
  if (kind === "flashcard") return pick({ kind, ...detail }, ["kind", "front", "back"]);
  if (kind === "atom") return pick({ kind, ...detail }, ["kind", "element", "label", "nonbondingElectrons", "bondOrderSum"]);
  return { kind };
}

function projectCanvasAnalysis(value: unknown): Record<string, unknown> {
  const source = record(value);
  const identifiers = collectIdentifiers(source);
  const analysis = record(source.observedEvidence);
  const inferred = record(source.inferredInterpretations);
  const selectedContext = record(analysis.selectedContext);
  return {
    ...(typeof source.analysisStatus === "string" ? { analysisStatus: source.analysisStatus } : {}),
    observedEvidence: {
      items: list(analysis.items).map((item) => projectEvidence(item, identifiers)),
      conflicts: list(analysis.conflicts).map((conflict) => ({ values: list(record(conflict).values).map((value) => redactIdentifiers(String(value), identifiers)), resolution: record(conflict).resolution })),
      warnings: list(analysis.warnings).map((warning) => redactIdentifiers(String(warning), identifiers)),
      ...(selectedContext.truncated === true ? { incomplete: true } : {}),
    },
    inferredInterpretations: {
      items: list(inferred.items).map((item) => {
        const entry = record(item);
        return { statement: redactIdentifiers(String(entry.statement ?? ""), identifiers), confidence: entry.confidence, uncertainty: list(entry.uncertainty).map((reason) => redactIdentifiers(String(reason), identifiers)), verificationStatus: "unverified" };
      }),
    },
    relationships: list(source.relationships).map((relationship) => {
      const entry = record(relationship);
      return { relation: redactIdentifiers(String(entry.relation ?? ""), identifiers), classification: entry.classification, verificationStatus: entry.verificationStatus, uncertainty: list(entry.uncertainty).map((reason) => redactIdentifiers(String(reason), identifiers)) };
    }),
  };
}

function projectEvidence(value: unknown, identifiers: Set<string>): Record<string, unknown> {
  const item = record(value);
  return {
    kind: item.kind,
    text: redactIdentifiers(String(item.text ?? ""), identifiers),
    origin: item.origin,
    uncertain: item.uncertain === true,
    ...(list(item.uncertaintyReasons).length ? { uncertaintyReasons: list(item.uncertaintyReasons).map((reason) => redactIdentifiers(String(reason), identifiers)) } : {}),
  };
}

function scientificLabels(objects: unknown[]): Map<string, string> {
  const labels = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const value of objects) {
    const object = record(value);
    const kind = string(object.kind) ?? "object";
    let label = string(object.label) ?? string(object.title) ?? string(object.name) ?? string(object.expression) ?? string(object.prompt);
    if (!label && kind === "atom") label = string(object.element);
    if (!label) {
      const count = (counts.get(kind) ?? 0) + 1;
      counts.set(kind, count);
      label = `${kind} ${count}`;
    }
    if (typeof object.id === "string") labels.set(object.id, label);
    for (const atom of list(object.atoms)) {
      const entry = record(atom);
      if (typeof entry.id === "string" && typeof entry.element === "string") labels.set(entry.id, entry.element);
    }
  }
  return labels;
}

function arrowDirection(from: unknown, to: unknown): string | undefined {
  const a = record(from), b = record(to);
  if (![a.x, a.y, b.x, b.y].every((value) => typeof value === "number" && Number.isFinite(value))) return undefined;
  const dx = Number(b.x) - Number(a.x), dy = Number(b.y) - Number(a.y);
  const horizontal = dx > 1 ? "right" : dx < -1 ? "left" : "";
  const vertical = dy > 1 ? "down" : dy < -1 ? "up" : "";
  return [horizontal, vertical].filter(Boolean).join(" and ") || "undetermined";
}

function collectIdentifiers(value: unknown, result = new Set<string>(), key = ""): Set<string> {
  if (Array.isArray(value)) { for (const item of value) collectIdentifiers(item, result, key); return result; }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /(?:^|id|ids|ref|hash|revision|board|course|lesson)$/i.test(key)) result.add(value);
    return result;
  }
  for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) collectIdentifiers(child, result, childKey);
  return result;
}

function redactIdentifiers(value: string, identifiers: Set<string>): string {
  return [...identifiers].filter(Boolean).sort((a, b) => b.length - a.length).reduce((text, identifier) => text.split(identifier).join("canvas object"), value);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

function string(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function citationLocation(citation: TutorCitation): string {
  return citation.unitType === "page" ? "page " + citation.unitNumber : citation.unitType === "slide" ? "slide " + citation.unitNumber : "document text";
}

function markdownLabel(value: string): string {
  return value.replace(/[\[\]\\]/g, " ");
}
