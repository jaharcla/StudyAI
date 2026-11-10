type ContextItem = { description: string; value: unknown };
type ContextMessage = { _getType?: () => string; type?: string; role?: string; name?: string; content?: unknown };

export type TutorContextBudgetDiagnostics = {
  phase: string;
  budgetTokens: number;
  estimatedTokens: number;
  totalCharacters: number;
  systemInstructionCharacters?: number;
  contextCharacters?: number;
  contextItems?: Array<{ description: string; characters: number; included: boolean }>;
  evidenceCharacters?: number;
  conversationCharacters?: number;
  messages: Array<{ type: string; name?: string; contentCharacters: number }>;
};

const protectedDescriptions = new Set([
  "StudyAI current workspace and structured canvas metadata",
  "StudyAI selected model",
  "StudyAI active scientific canvas objects",
  "Active Quickdraw board context",
  "StudyAI canvas analysis result",
  "StudyAI active learning activity",
]);

export class TutorContextBudgetError extends Error {
  constructor(readonly estimatedTokens: number, readonly budgetTokens: number, readonly diagnostics?: TutorContextBudgetDiagnostics) {
    super("The current canvas and conversation exceed the Tutor context budget.");
    this.name = "TutorContextBudgetError";
  }
}

export function getTutorContextBudget(env: NodeJS.ProcessEnv = process.env, model?: string): number {
  const raw = env.TUTOR_CONTEXT_BUDGET;
  const value = raw === undefined || raw.trim() === "" ? 16_384 : Number(raw);
  if (!Number.isInteger(value) || value < 512 || value > 131_072) throw new Error("TUTOR_CONTEXT_BUDGET must be an integer from 512 through 131072.");
  let modelLimit = value;
  if (env.TUTOR_MODEL_CONTEXT_LIMITS?.trim()) {
    let limits: Record<string, unknown>;
    try { limits = JSON.parse(env.TUTOR_MODEL_CONTEXT_LIMITS); }
    catch { throw new Error("TUTOR_MODEL_CONTEXT_LIMITS must be a JSON object of model names to context token limits."); }
    if (!limits || typeof limits !== "object" || Array.isArray(limits)) throw new Error("TUTOR_MODEL_CONTEXT_LIMITS must be a JSON object of model names to context token limits.");
    for (const [name, limit] of Object.entries(limits)) if (!name.trim() || !Number.isInteger(limit) || Number(limit) < 512 || Number(limit) > 131_072) throw new Error("Each TUTOR_MODEL_CONTEXT_LIMITS value must be an integer from 512 through 131072.");
    if (model && limits[model] !== undefined) modelLimit = Number(limits[model]);
  }
  return Math.min(value, modelLimit);
}

export function budgetTutorContext(input: {
  systemInstructions: string;
  contexts: ContextItem[];
  evidence: unknown;
  conversation: any[];
  budgetTokens: number;
}) {
  const protectedContexts = input.contexts.filter((item) => protectedDescriptions.has(item.description));
  const optionalContexts = input.contexts.filter((item) => !protectedDescriptions.has(item.description));
  const turns = conversationTurns(input.conversation);
  const latestTurn = turns.at(-1) ?? [];
  const latestUser = [...latestTurn].reverse().find(isHuman);
  const requiredConversation = latestUser ? latestTurn.slice(latestTurn.indexOf(latestUser)) : [];
  let contexts = protectedContexts;
  let conversation = requiredConversation;
  const canvasBudget = Math.min(8_000, Math.max(1_500, Math.floor(input.budgetTokens * 0.45)));
  const base = measure(input.systemInstructions, contexts, input.evidence, conversation);
  const canvasAnalysis = contexts.find((item) => item.description === "StudyAI canvas analysis result");
  if (canvasAnalysis && (base > input.budgetTokens || serializedCharacters(canvasAnalysis.value) > canvasBudget)) {
    contexts = contexts.map((item) => item === canvasAnalysis
      ? { ...item, value: compactCanvasAnalysisForTutor(item.value, canvasBudget) }
      : item);
  }
  const compactedBase = measure(input.systemInstructions, contexts, input.evidence, conversation);
  if (compactedBase > input.budgetTokens) throw new TutorContextBudgetError(compactedBase, input.budgetTokens, diagnoseTutorContext(input, contexts, conversation, "protected_context_preflight"));

  for (const item of optionalContexts) {
    const candidate = [...contexts, item];
    if (measure(input.systemInstructions, candidate, input.evidence, conversation) <= input.budgetTokens) contexts = candidate;
  }

  let includedTurns = 1;
  for (let index = turns.length - 2; index >= 0; index--) {
    const candidate = [...turns[index], ...conversation];
    if (measure(input.systemInstructions, contexts, input.evidence, candidate) > input.budgetTokens) break;
    conversation = candidate;
    includedTurns++;
  }

  return {
    contexts,
    conversation,
    canvasJson: JSON.stringify(contexts),
    evidenceJson: JSON.stringify(input.evidence),
    estimatedTokens: measure(input.systemInstructions, contexts, input.evidence, conversation),
    omittedContextCount: input.contexts.length - contexts.length,
    omittedTurnCount: Math.max(0, turns.length - includedTurns),
  };
}

function compactCanvasAnalysisForTutor(value: unknown, maxChars: number): unknown {
  const root = asRecord(value);
  const observed = asRecord(root.observedEvidence);
  const selected = asRecord(observed.selectedContext);
  const inferred = asRecord(root.inferredInterpretations);
  const omitted: Record<string, number> = {};
  omitted.duplicateSelectedEvidence = Array.isArray(selected.evidence) ? selected.evidence.length : 0;
  omitted.sourceGeometryDetails = Array.isArray(selected.sourceRecords) ? selected.sourceRecords.length : 0;
  omitted.intermediateInterpretations = Array.isArray(inferred.items)
    ? inferred.items.filter((item) => asRecord(item).structure !== undefined || asRecord(item).fusion !== undefined).length
    : 0;
  omitted.diagnostics = root.diagnostics === undefined ? 0 : 1;
  const take = (name: string, value: unknown, limit: number, map: (item: unknown) => unknown = (item) => boundedCanvasValue(item)): unknown[] => {
    if (!Array.isArray(value)) return [];
    omitted[name] = (omitted[name] ?? 0) + Math.max(0, value.length - limit);
    return value.slice(0, limit).map(map);
  };
  const evidenceItem = (value: unknown) => {
    const item = asRecord(value);
    return {
      id: item.id,
      origin: item.origin,
      kind: item.kind,
      subjectId: item.subjectId,
      claimKey: item.claimKey,
      claimValue: boundedCanvasValue(item.claimValue),
      ...(item.sourceRef !== undefined ? { sourceRef: boundedCanvasValue(item.sourceRef) } : {}),
      text: boundedCanvasText(item.text, 600),
      sourceIds: take("sourceIds", item.sourceIds, 40, (id) => id),
      confidence: item.confidence,
      locationPrecision: item.locationPrecision,
      uncertain: item.uncertain,
      uncertaintyReasons: take("uncertaintyReasons", item.uncertaintyReasons, 8, (reason) => boundedCanvasText(reason, 240)),
      provenanceIds: take("provenanceIds", item.provenanceIds, 8, (id) => id),
    };
  };
  const interpretation = (value: unknown) => {
    const item = asRecord(value);
    return {
      interpretationId: item.interpretationId,
      statement: boundedCanvasText(item.statement, 1_200),
      sourceObjectIds: take("interpretationSourceIds", item.sourceObjectIds, 40, (id) => id),
      supportingEvidenceIds: take("supportingEvidenceIds", item.supportingEvidenceIds, 40, (id) => id),
      confidence: item.confidence,
      uncertainty: take("interpretationUncertainty", item.uncertainty, 12, (reason) => boundedCanvasText(reason, 240)),
      provenanceIds: take("interpretationProvenanceIds", item.provenanceIds, 8, (id) => id),
      verificationStatus: item.verificationStatus,
      ...(item.fusion !== undefined ? { fusion: compactFusion(item.fusion) } : {}),
    };
  };
  const relationship = (value: unknown) => {
    const item = asRecord(value);
    return {
      fromId: item.fromId,
      toId: item.toId,
      relation: boundedCanvasText(item.relation, 300),
      sourceIds: take("relationshipSourceIds", item.sourceIds, 40, (id) => id),
      confidence: item.confidence,
      basis: item.basis,
      classification: item.classification,
      verificationStatus: item.verificationStatus,
      uncertainty: take("relationshipUncertainty", item.uncertainty, 8, (reason) => boundedCanvasText(reason, 240)),
      provenanceIds: take("relationshipProvenanceIds", item.provenanceIds, 8, (id) => id),
    };
  };
  const compact = {
    schemaVersion: root.schemaVersion,
    boardId: root.boardId,
    courseId: root.courseId,
    lessonId: root.lessonId,
    revision: root.revision,
    snapshotHash: root.snapshotHash,
    revisionHash: root.revisionHash,
    sourceObjectIds: take("sourceObjectIds", root.sourceObjectIds, 120, (id) => id),
    sourceObjectRefs: take("sourceObjectRefs", root.sourceObjectRefs, 120),
    observedEvidence: {
      sourceScope: boundedCanvasValue(observed.sourceScope),
      items: take("observedEvidenceItems", observed.items, 40, evidenceItem),
      conflicts: take("conflicts", observed.conflicts, 30),
      warnings: take("observedWarnings", observed.warnings, 20, (warning) => boundedCanvasText(warning, 300)),
      selectedContext: {
        schemaVersion: selected.schemaVersion,
        scope: boundedCanvasValue(selected.scope),
        sourceRecords: take("sourceRecords", selected.sourceRecords, 60, (source) => {
          const item = asRecord(source);
          return { id: item.id, type: item.type, ...(typeof item.text === "string" ? { text: boundedCanvasText(item.text, 300) } : {}) };
        }),
        scientificObjects: take("scientificObjects", selected.scientificObjects, 20),
        excludedEvidenceCount: selected.excludedEvidenceCount,
        excludedSourceCount: selected.excludedSourceCount,
        truncated: selected.truncated,
      },
    },
    inferredInterpretations: {
      evidence: take("inferredEvidence", inferred.evidence, 30, evidenceItem),
      items: take("interpretations", inferred.items, 30, interpretation),
    },
    relationships: take("relationships", root.relationships, 40, relationship),
    uncertainty: take("uncertainty", root.uncertainty, 30),
    provenance: take("provenance", root.provenance, 30),
    analysisStatus: root.analysisStatus,
    pipelineVersion: root.pipelineVersion,
  } as Record<string, unknown>;

  const arraysToPrune = [
    ["inferredEvidence", asRecord(compact.inferredInterpretations).evidence],
    ["sourceRecords", asRecord(asRecord(compact.observedEvidence).selectedContext).sourceRecords],
    ["scientificObjects", asRecord(asRecord(compact.observedEvidence).selectedContext).scientificObjects],
    ["relationships", compact.relationships],
    ["provenance", compact.provenance],
    ["uncertainty", compact.uncertainty],
    ["observedEvidenceItems", asRecord(compact.observedEvidence).items],
    ["interpretations", asRecord(compact.inferredInterpretations).items],
    ["conflicts", asRecord(compact.observedEvidence).conflicts],
    ["sourceObjectRefs", compact.sourceObjectRefs],
    ["sourceObjectIds", compact.sourceObjectIds],
    ["observedWarnings", asRecord(compact.observedEvidence).warnings],
  ] as Array<[string, unknown]>;
  const compactInterpretations = asRecord(compact.inferredInterpretations).items;
  if (Array.isArray(compactInterpretations)) {
    for (const item of compactInterpretations) {
      const fusion = asRecord(asRecord(item).fusion);
      arraysToPrune.splice(1, 0, ["fusionObjects", fusion.objects], ["fusionRelationships", fusion.relationships]);
    }
  }
  compact.tutorContextCompaction = { truncated: true, omitted };
  const canPrune = (value: unknown): value is unknown[] => Array.isArray(value) && value.length > 0;
  while (JSON.stringify(compact).length > maxChars) {
    let pruned = false;
    for (const [name, array] of arraysToPrune) {
      if (!canPrune(array)) continue;
      array.pop();
      omitted[name] = (omitted[name] ?? 0) + 1;
      pruned = true;
      break;
    }
    if (!pruned) break;
  }
  compact.tutorContextCompaction = { truncated: true, omitted };
  return compact;
}

function compactFusion(value: unknown): unknown {
  const fusion = asRecord(value);
  return {
    answer: boundedCanvasText(fusion.answer, 1_200),
    objects: Array.isArray(fusion.objects) ? fusion.objects.slice(0, 8).map((item) => boundedCanvasValue(item)) : [],
    relationships: Array.isArray(fusion.relationships) ? fusion.relationships.slice(0, 8).map((item) => boundedCanvasValue(item)) : [],
    uncertainties: boundedCanvasValue(fusion.uncertainties),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedCanvasText(value: unknown, maxChars: number): unknown {
  return typeof value === "string" && value.length > maxChars ? value.slice(0, maxChars) + "…" : value;
}

function boundedCanvasValue(value: unknown, depth = 0, budget = { remaining: 1_200 }): unknown {
  if (budget.remaining <= 0) return "[canvas detail omitted]";
  if (typeof value === "string") {
    const text = boundedCanvasText(value, Math.min(600, budget.remaining));
    budget.remaining -= typeof text === "string" ? text.length : 0;
    return text;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    budget.remaining -= 16;
    return value;
  }
  if (depth >= 4) return "[nested canvas detail omitted]";
  if (Array.isArray(value)) {
    const result = [];
    for (const item of value.slice(0, 20)) {
      if (budget.remaining <= 0) break;
      result.push(boundedCanvasValue(item, depth + 1, budget));
    }
    return result;
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 24)) {
      if (budget.remaining <= 0) break;
      budget.remaining -= key.length;
      result[key] = boundedCanvasValue(item, depth + 1, budget);
    }
    return result;
  }
  return undefined;
}

export function estimateTutorMessageTokens(messages: unknown[]): number {
  const [system, ...conversation] = messages as Array<{ content?: unknown }>;
  const systemText = typeof system?.content === "string" ? system.content : JSON.stringify(system?.content ?? "");
  return Math.ceil((systemText.length + JSON.stringify(conversation).length + 128) / 3);
}

export function diagnoseTutorMessages(messages: unknown[], budgetTokens: number): TutorContextBudgetDiagnostics {
  const [system, ...conversation] = messages as ContextMessage[];
  const systemText = typeof system?.content === "string" ? system.content : JSON.stringify(system?.content ?? "");
  const conversationCharacters = JSON.stringify(conversation).length;
  const totalCharacters = systemText.length + conversationCharacters + 128;
  return {
    phase: "provider_message_preflight",
    budgetTokens,
    estimatedTokens: Math.ceil(totalCharacters / 3),
    totalCharacters,
    systemInstructionCharacters: systemText.length,
    conversationCharacters,
    messages: conversation.map((message) => ({
      type: message._getType?.() ?? message.type ?? message.role ?? "unknown",
      ...(message.name ? { name: message.name } : {}),
      contentCharacters: messageContentCharacters(message.content),
    })),
  };
}

function diagnoseTutorContext(input: {
  systemInstructions: string;
  contexts: ContextItem[];
  evidence: unknown;
  budgetTokens: number;
}, includedContexts: ContextItem[], conversation: ContextMessage[], phase: string): TutorContextBudgetDiagnostics {
  const contextCharacters = JSON.stringify(includedContexts).length;
  const evidenceCharacters = JSON.stringify(input.evidence).length;
  const conversationCharacters = JSON.stringify(conversation).length;
  const totalCharacters = input.systemInstructions.length + contextCharacters + evidenceCharacters + conversationCharacters + 128;
  return {
    phase,
    budgetTokens: input.budgetTokens,
    estimatedTokens: Math.ceil(totalCharacters / 3),
    totalCharacters,
    systemInstructionCharacters: input.systemInstructions.length,
    contextCharacters,
    contextItems: input.contexts.map((item) => ({
      description: item.description,
      characters: serializedCharacters(item.value),
      included: includedContexts.some((included) => included.description === item.description),
    })),
    evidenceCharacters,
    conversationCharacters,
    messages: conversation.map((message) => ({
      type: message._getType?.() ?? message.type ?? message.role ?? "unknown",
      ...(message.name ? { name: message.name } : {}),
      contentCharacters: messageContentCharacters(message.content),
    })),
  };
}

function serializedCharacters(value: unknown): number {
  try { return JSON.stringify(value)?.length ?? 0; } catch { return 0; }
}

function messageContentCharacters(value: unknown): number {
  return typeof value === "string" ? value.length : serializedCharacters(value);
}

function conversationTurns(messages: any[]): any[][] {
  const turns: any[][] = [];
  for (const message of messages) {
    if (isHuman(message) || turns.length === 0) turns.push([]);
    turns[turns.length - 1].push(message);
  }
  return turns.filter((turn) => turn.length > 0);
}

function isHuman(message: any): boolean {
  return message?._getType?.() === "human" || message?.type === "human";
}

function measure(system: string, contexts: ContextItem[], evidence: unknown, conversation: any[]): number {
  const chars = system.length + JSON.stringify(contexts).length + JSON.stringify(evidence).length + JSON.stringify(conversation).length + 128;
  return Math.ceil(chars / 3);
}
