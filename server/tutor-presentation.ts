import { directionAngleDegrees } from "../src/canvas/geometry.js";

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

export function presentTutorResponse(answer: string, candidates: readonly TutorCitationCandidate[], options: { linkMentionedSource?: boolean } = {}): TutorStudentResponse {
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
    .replace(/\[([^\]]+)\]\[((?:studyai:\/\/document\/|https:\/\/studyai\.org\/document\/)[^\]]+)\]/g, (_match, _label: string, reference: string) => {
      const rendered = renderReference(reference);
      if (!rendered) { rejectedCitationCount++; return ""; }
      return rendered;
    })
    .replace(/(?:\[([^\]]*)\]|【([^】\]]*)[】\]])\(#studyai-citation=([^)]+)\)/g, (_match, _squareLabel: string | undefined, _fullWidthLabel: string | undefined, encoded: string) => {
      let sourceRef: string;
      try { sourceRef = decodeURIComponent(encoded); } catch { rejectedCitationCount++; return ""; }
      const rendered = renderReference(sourceRef);
      if (!rendered) { rejectedCitationCount++; return ""; }
      return rendered;
    })
    .replace(/(?:\[([^\]]*)\]|【([^】\]]*)[】\]])\((studyai:\/\/document\/[^)]+)\)/g, (_match, _squareLabel: string | undefined, _fullWidthLabel: string | undefined, sourceRef: string) => {
      const rendered = renderReference(sourceRef);
      if (!rendered) { rejectedCitationCount++; return ""; }
      return rendered;
    })
    .replace(/【([^】]*)\((https:\/\/studyai\.org\/document\/[^)]+)\)】/g, (_match, _label: string, reference: string) => {
      const rendered = renderReference(reference);
      if (!rendered) { rejectedCitationCount++; return ""; }
      return rendered;
    })
    .replace(/(?:\[([^\]]*)\]|【([^】\]]*)[】\]])\((https:\/\/studyai\.org\/document\/[^)]+)\)/g, (_match, _squareLabel: string | undefined, _fullWidthLabel: string | undefined, reference: string) => {
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
  const renderedCitations = [...citations.values()];
  if (!options.linkMentionedSource || renderedCitations.length) return { answer: cleaned, citations: renderedCitations, rejectedCitationCount };

  const sourceLine = cleaned.match(/(^|\n)[ \t]*source\s*:[^\n]*/i);
  if (!sourceLine) return { answer: cleaned, citations: renderedCitations, rejectedCitationCount };
  const mentionedSource = normalizeCitationText(sourceLine[0]);
  const matches = candidates.filter((candidate) => mentionedSource.includes(normalizeCitationText(candidate.filename)) && mentionedSource.includes(normalizeCitationText(citationLocation(candidate))));
  if (matches.length !== 1) return { answer: cleaned, citations: renderedCitations, rejectedCitationCount };

  const candidate = matches[0];
  const citation = { sourceRef: candidate.sourceRef, filename: candidate.filename, unitType: candidate.unitType, unitNumber: candidate.unitNumber };
  const link = `[${markdownLabel(citation.filename + " · " + citationLocation(citation))}](#studyai-citation=${encodeURIComponent(citation.sourceRef)})`;
  const linkedSourceLine = sourceLine[0].replace(/(^|\n)[ \t]*source\s*:[^\n]*/i, (_line, prefix: string) => `${prefix}Source: ${link}`);
  return { answer: cleaned.replace(sourceLine[0], linkedSourceLine), citations: [citation], rejectedCitationCount };
}

function sanitizeMathDelimiters(line: string): string {
  // Normalize math delimiters so KaTeX never sees a '$' inside math mode.
  // A '$$...$$' block that only wrapped a single inline expression (the model
  // sometimes nests '$...$' inside '$$...$$') is collapsed back to inline math
  // so the result reads naturally instead of becoming a displayed equation.
  return line.replace(/\$\$([\s\S]*?)\$\$/g, (_m, body: string) => {
    const hadInnerDollar = body.includes("$");
    const cleaned = body.replace(/\$/g, "").trim();
    if (!cleaned) return "";
    if (hadInnerDollar && !cleaned.includes("\n")) return `$${cleaned}$`;
    if (cleaned.includes("\n")) return `$$\n${cleaned}\n$$`;
    return `$$${cleaned}$$`;
  })
  .replace(/\$([^\n$]*?)\$/g, (_m, body: string) => `$${body.replace(/\$/g, "")}$`);
}

function hasProse(run: string): boolean {
  const stripped = run.replace(/\\[a-zA-Z]+\{[^}]*\}/g, "").replace(/\\[a-zA-Z]+/g, "");
  return /[A-Za-z]{2,}/.test(stripped);
}

function wrapBareRun(run: string): string {
  if (run.includes("$")) return run;
  const match = run.match(/^(.*?)([.!?]+\s*)$/);
  const body = match ? match[1] : run;
  const punct = match ? match[2] : "";
  return `$${body.trim().replace(/\$/g, "")}$${punct}`;
}

export function renderTutorResponse(response: TutorStudentResponse): string {
  return response.answer
    .split(/(```[\s\S]*?```)/)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      const segments = part.split(/(\$\$[\s\S]+?\$\$|\$[^\n$]+?\$)/);
      return segments.map((seg, j) => {
        if (j % 2 === 1) return sanitizeMathDelimiters(seg);
        let out = seg.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `$$${body.replace(/\$/g, "")}$$`);
        out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$${body.replace(/\$/g, "")}$`);
        out = out.split("\n").map((line) => {
          if (/^\s*\$\$[\s\S]*\$\$\s*$/.test(line)) return sanitizeMathDelimiters(line);
          if (/^\s*\$[^\n$]*\$$/.test(line)) return sanitizeMathDelimiters(line);
          if (line.includes("$")) line = sanitizeMathDelimiters(line);
          if (line.includes("$")) return line;
          if (!/\\[a-zA-Z]/.test(line)) return line;
          if (hasProse(line)) return line;
          return line.replace(/([^\n]*?\\[a-zA-Z]+[^\n]*?)(?=\n|$)/g, (run) => {
            if (run.includes("$")) return run;
            if (!/\\[a-zA-Z]/.test(run)) return run;
            if (hasProse(run)) return run;
            return wrapBareRun(run);
          });
        }).join("\n");
        return out;
      }).join("").replace(/\$\$(?=\$)/g, () => "$$\n").replace(/\$(?=\$\$)/g, () => "$\n").replace(/\n{3,}/g, "\n\n");
    }).join("");
}

export function projectTutorContexts(contexts: TutorContextItem[], includeRawCanvasMetadata: boolean): TutorContextItem[] {
  if (includeRawCanvasMetadata) return contexts;

  const scienceContext = contexts.find((item) => item.description === "StudyAI active scientific canvas objects");
  const objects = list(record(scienceContext?.value).objects);
  const labels = scientificLabels(objects);
  return contexts.map((item) => {
    if (item.description === "StudyAI current workspace and structured canvas metadata") return { ...item, value: projectWorkspace(item.value) };
    if (item.description === "StudyAI active scientific canvas objects") return { ...item, value: projectScienceContext(item.value, labels) };
    if (item.description === "Active canvas scene") return { ...item, value: projectCanvasSceneContext(item.value, labels) };
    if (item.description === "StudyAI canvas analysis result") return { ...item, value: projectCanvasAnalysis(item.value) };
    return item;
  });
}

const INCOMPLETE_CANVAS_REASON = "Only part of the board is included; ask the user to select or zoom to the relevant area before claiming something is absent.";

function projectCanvasSceneContext(value: unknown, labels: Map<string, string>): Record<string, unknown> {
  const source = record(value);
  if (!source.scene) {
    return source.shapes ? projectQuickdrawContext(source.shapes, labels) : projectQuickdrawContext(value, labels);
  }
  const scene = record(source.scene);
  const diagram = source.shapes ? projectQuickdrawContext(source.shapes, labels) : {};
  const nodes = list(scene.nodes).map((node) => {
    const item = record(node);
    const text = string(item.text);
    const confidence = typeof item.confidence === "number" ? item.confidence : null;
    return {
      ...(item.kind === "stroke-group" ? { id: string(item.id) } : {}),
      kind: string(item.kind) ?? "unknown",
      ...(text ? { text } : {}),
      status: string(item.verificationStatus) ?? "unconfirmed",
      ...(confidence !== null ? { confidence } : {}),
      ...(list(item.uncertaintyReasons).length ? { uncertain: true } : {}),
    };
  });
  const edges = list(scene.edges).map((edge) => {
    const item = record(edge);
    return {
      relation: string(item.kind) ?? "related",
      ...(typeof item.distance === "number" ? { distance: Math.round(item.distance) } : {}),
    };
  });
  const ambientClusters = list(scene.ambientClusters).map((value) => {
    const cluster = record(value);
    const labels = list(cluster.sampleLabels).filter((label): label is string => typeof label === "string");
    const unconfirmedCount = typeof cluster.unconfirmedCount === "number" ? cluster.unconfirmedCount : 0;
    return {
      summary: string(cluster.summary) ?? "Additional board content",
      ...(labels.length ? { sampleLabels: labels } : {}),
      ...(unconfirmedCount > 0 ? { unconfirmedCount } : {}),
    };
  });
  return {
    ...diagram,
    scope: pick(record(scene.scope), ["boardId", "revision"]),
    selectedCount: list(source.selectedIds).length,
    nodes,
    edges,
    ...(ambientClusters.length ? { ambientClusters } : {}),
    ...(Array.isArray(source.connections) ? { connections: list(source.connections) } : {}),
    ...(scene.truncated === true ? { incomplete: true, incompleteReason: INCOMPLETE_CANVAS_REASON } : {}),
  };
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
  if (kind === "vector" || kind === "force") return pick(object, ["kind", "components", "units", "label", "pointOfApplication"]);
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
    if (type === "draw" || type === "highlight") {
      const stroke = record(shape.strokeSummary);
      const bounds = record(stroke.bounds);
      return {
        kind: "freehand stroke",
        ...(typeof stroke.pointCount === "number" ? { pointCount: stroke.pointCount } : {}),
        ...([bounds.x, bounds.y, bounds.w, bounds.h].every((value) => typeof value === "number")
          ? { bounds: [bounds.x, bounds.y, bounds.w, bounds.h] } : {}),
        observation: "A drawn mark: use its position and the nearest labels to interpret it; do not treat it as meaningless.",
      };
    }
    if (type === "text" || type === "note") return { kind: "text label", text: text ?? "" };
    if (type === "geo") return { kind: "shape", geometry: string(shape.geometry) ?? "shape" };
    const arrow = record(shape.arrow);
    const directional = type === "arrow" || type === "line";
    const from = finitePoint(arrow.from), to = finitePoint(arrow.to);
    const direction = directional ? arrowDirection(arrow.from, arrow.to) : undefined;
    const angle = directional && from && to ? Math.round(directionAngleDegrees(from, to) * 10) / 10 : undefined;
    return {
      kind: type,
      ...(direction ? { direction } : {}),
      ...(angle !== undefined ? { angleFromHorizontalDegrees: angle, verticalOrientation: verticalOrientation(angle) } : {}),
      ...(Number(arrow.bend) ? { curved: true } : {}),
      ...(typeof arrow.length === "number" ? { length: Math.round(arrow.length) } : {}),
      ...(string(arrow.label) ? { label: string(arrow.label) } : {}),
      ...(Array.isArray(arrow.labels) ? { labels: list(arrow.labels).map((label) => { const item = record(label); return { text: string(item.text) ?? "", confidence: typeof item.confidence === "number" ? item.confidence : null }; }) } : {}),
      ...(Array.isArray(arrow.startAttached) ? { startAttached: list(arrow.startAttached).map((attachment) => { const item = record(attachment); return { kind: string(item.kind) ?? "unknown", ...(string(item.label) ? { label: string(item.label) } : {}), confidence: typeof item.confidence === "number" ? item.confidence : null }; }) } : {}),
      ...(Array.isArray(arrow.endAttached) ? { endAttached: list(arrow.endAttached).map((attachment) => { const item = record(attachment); return { kind: string(item.kind) ?? "unknown", ...(string(item.label) ? { label: string(item.label) } : {}), confidence: typeof item.confidence === "number" ? item.confidence : null }; }) } : {}),
      ...(arrow.unattached === true ? { unattached: true } : {}),
    };
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
    scope: pick(record(source.scope), ["boardId", "revision"]),
    selected: projectedSelected,
    visible: projectedVisible,
    nearbyObjects,
    spatialRelationships: relationships,
    ...(source.truncated === true ? { incomplete: true, incompleteReason: INCOMPLETE_CANVAS_REASON } : {}),
  };
}

function roundNumbers(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 10) / 10 : value;
  if (Array.isArray(value)) return value.slice(0, 24).map(roundNumbers);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundNumbers(item)]));
  return value;
}

function projectNearbyObject(value: unknown, labels: Map<string, string>): Record<string, unknown> | null {
  const projected = projectNearbyObjectRaw(value, labels);
  return projected ? roundNumbers(projected) as Record<string, unknown> : null;
}

function projectNearbyObjectRaw(value: unknown, labels: Map<string, string>): Record<string, unknown> | null {
  const item = record(value);
  const kind = string(item.kind);
  const detail = record(item.detail);
  if (!kind) return null;
  if (kind === "molecule") {
    // Present atoms with human labels only — raw ids must never reach the model
    // (or the answer). Mirror projectScientificObject's C1/H1 labelling.
    const counts = new Map<string, number>();
    const atomLabels = new Map<string, string>();
    const atoms = list(detail.atoms).map(record).map((atom) => {
      const element = string(atom.element) ?? "atom";
      const index = (counts.get(element) ?? 0) + 1;
      counts.set(element, index);
      const label = `${element}${index}`;
      if (typeof atom.id === "string") atomLabels.set(atom.id, label);
      return { label, element, nonbondingElectrons: atom.nonbondingElectrons };
    });
    const bonds = list(detail.bonds).map(record).map((bond) => ({
      from: atomLabels.get(string(bond.from) ?? "") ?? "unknown atom",
      to: atomLabels.get(string(bond.to) ?? "") ?? "unknown atom",
      order: bond.order,
    }));
    return {
      kind,
      name: detail.name,
      atomCount: detail.atomCount,
      ...(typeof detail.formula === "string" ? { formula: detail.formula } : {}),
      ...(atoms.length ? { atoms } : {}),
      ...(bonds.length ? { bonds } : {}),
    };
  }
  if (kind === "bond") return { kind, label: detail.label, from: labels.get(string(detail.from) ?? "") ?? "an atom", to: labels.get(string(detail.to) ?? "") ?? "an atom", order: detail.order };
  if (kind === "equation") return { kind, expression: detail.expression, variables: detail.variables, ...(detail.units ? { units: detail.units } : {}), ...(detail.result !== undefined ? { result: detail.result } : {}), ...(detail.evaluationError ? { evaluationError: detail.evaluationError } : {}) };
  if (kind === "graph") return { kind, ...pick(detail, ["expression", "xRange", "xLabel", "yLabel", "pointCount", "points", "evaluationError"]) };
  if (kind === "vector" || kind === "force") {
    const components = Array.isArray(detail.components) ? detail.components.filter((value): value is number => typeof value === "number") : [];
    const magnitude = Math.round(Math.hypot(...components) * 10) / 10;
    // Components are already Cartesian (Y-up), so atan2(y, x) is the signed
    // direction from horizontal. Keep a decimal so small inclinations survive.
    const angleDegrees = components.length >= 2 ? Math.round(Math.atan2(components[1], components[0]) * 1800 / Math.PI) / 10 : undefined;
    return {
      kind,
      ...(string(detail.label) ? { label: string(detail.label) } : {}),
      ...(string(detail.units) ? { units: string(detail.units) } : {}),
      ...(components.length ? { magnitude, ...(angleDegrees !== undefined ? { angleDegrees, verticalOrientation: verticalOrientation(angleDegrees) } : {}) } : {}),
    };
  }
  if (kind === "measurement") return pick({ kind, ...detail }, ["kind", "value", "units", "label"]);
  if (kind === "anatomy") return pick({ kind, ...detail }, ["kind", "structureId", "system", "labels"]);
  if (kind === "concept") return pick({ kind, ...detail }, ["kind", "title", "definition"]);
  if (kind === "relationship") return { kind, label: detail.label, from: labels.get(string(detail.fromId) ?? "") ?? "one object", to: labels.get(string(detail.toId) ?? "") ?? "another object" };
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
  const aliases = canvasSourceAliases(list(selectedContext.sourceRecords).map(record), list(selectedContext.scientificObjects).map(record));
  return {
    ...(typeof source.analysisStatus === "string" ? { analysisStatus: source.analysisStatus } : {}),
    observedEvidence: {
      items: list(analysis.items).map((item) => projectEvidence(item, identifiers, aliases)),
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

function projectEvidence(value: unknown, identifiers: Set<string>, aliases: Map<string, string>): Record<string, unknown> {
  const item = record(value);
  const association = record(item.association);
  const candidateRefs = list(association.candidateRefs).map(record);
  const spatialAssociation = typeof association.status === "string" ? {
    status: association.status,
    candidates: candidateRefs.map((ref) => aliases.get(`${string(ref.scope)}:${string(ref.id)}`) ?? "canvas object"),
    verificationStatus: "unconfirmed",
  } : undefined;
  const uncertaintyReasons = list(item.uncertaintyReasons).map((reason) => redactIdentifiers(String(reason), identifiers));
  if (spatialAssociation && !uncertaintyReasons.some((reason) => /not user-confirmed/i.test(reason))) uncertaintyReasons.push("Spatial association is not user-confirmed.");
  return {
    kind: item.kind,
    text: redactIdentifiers(String(item.text ?? ""), identifiers),
    origin: item.origin,
    uncertain: item.uncertain === true,
    ...(uncertaintyReasons.length ? { uncertaintyReasons } : {}),
    ...(spatialAssociation ? { spatialAssociation } : {}),
  };
}

function canvasSourceAliases(records: Record<string, unknown>[], scientific: Record<string, unknown>[]): Map<string, string> {
  const aliases = new Map<string, string>();
  const counts = new Map<string, number>();
  const add = (scope: "quickdraw" | "science", object: Record<string, unknown>) => {
    const id = string(object.id);
    if (!id) return;
    const type = string(object.type) ?? string(object.kind) ?? "object";
    const label = type === "force" ? "force arrow" : type === "vector" ? "vector" : type === "arrow" ? "arrow" : type.replace(/[-_]+/g, " ");
    const number = (counts.get(`${scope}:${label}`) ?? 0) + 1;
    counts.set(`${scope}:${label}`, number);
    aliases.set(`${scope}:${id}`, `${label} ${number}`);
  };
  records.forEach((object) => add("quickdraw", object));
  scientific.forEach((object) => add("science", object));
  return aliases;
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

function finitePoint(value: unknown): { x: number; y: number } | undefined {
  const point = record(value);
  return [point.x, point.y].every((item) => typeof item === "number" && Number.isFinite(item))
    ? { x: Number(point.x), y: Number(point.y) }
    : undefined;
}

function verticalOrientation(degrees: number): string {
  return degrees > 0 ? "above horizontal" : degrees < 0 ? "below horizontal" : "horizontal";
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
  const variants = new Set<string>();
  for (const identifier of identifiers) {
    if (!identifier) continue;
    variants.add(identifier);
    const suffix = identifier.split(/[:/]/).at(-1);
    if (suffix && suffix.length >= 4) variants.add(suffix);
  }
  let redacted = value;
  for (const identifier of [...variants].sort((a, b) => b.length - a.length)) {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    redacted = redacted.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu"), "canvas object");
  }
  return redacted
    .replace(/\bshape\s*:\s*[a-z0-9][a-z0-9:_-]{7,}\b/gi, "canvas object")
    .replace(/\bshape\s+(mw[a-z0-9]{8,})\b/gi, "canvas object")
    .replace(/\bmw[a-z0-9]{8,}\b/gi, "canvas object");
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
  return value.replace(/[[\]\\]/g, " ");
}

function normalizeCitationText(value: string): string {
  return value.normalize("NFKC").replace(/[‐‑‒–—−]/g, "-").toLocaleLowerCase();
}
