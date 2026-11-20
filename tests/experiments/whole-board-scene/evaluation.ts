import type { SceneEvidenceRef } from "../../../server/canvas-intelligence/scene-experiment.js";

export type SceneGoldItem = { id: string; text: string; kind: string; sourceIds: readonly string[]; state?: "clear" | "uncertain" };
export type SceneGoldRelation = { id: string; from: string; to: string; relation: string; evidenceIds: readonly string[]; connectorId?: string; state: "clear" | "uncertain"; ambiguityReason?: string };
export type SceneGold = { sourceHash: string; expectedFormula?: { formula: string; status: string; reason: string }; targetSourceIds?: readonly string[]; textItems: readonly SceneGoldItem[]; relations: readonly SceneGoldRelation[]; strokeGroups: readonly { id: string; sourceIds: readonly string[]; state: "clear" | "uncertain" }[] };
export type ScenePrediction = {
  observations: Array<{ text: string; kind: string; status: string; evidenceRefs: SceneEvidenceRef[] }>;
  relations: Array<{ from?: number; to?: number; fromSourceId?: string; toSourceId?: string; relation: string; status: string; evidenceRefs: SceneEvidenceRef[] }>;
  interpretations: Array<{ claim: string; status: string; evidenceRefs: SceneEvidenceRef[] }>;
  ambiguities: string[];
};

export function evaluateScenePredictions(args: {
  condition: "A" | "B" | "C" | "D";
  gold: SceneGold;
  prediction: ScenePrediction;
  knownStrokeIds: ReadonlySet<string>;
  candidateSources: ReadonlyMap<string, readonly string[]>;
  sourceLevel?: "item" | "region";
  rejectedReferenceCount?: number;
}) {
  const goldItems = args.gold.textItems.filter((item) => (item.state ?? "clear") === "clear");
  const sourceGroups = args.gold.strokeGroups.filter((group) => group.state === "clear");
  const resolved = args.prediction.observations.map((observation) => resolveReferences(observation.evidenceRefs, args.knownStrokeIds, args.candidateSources));
  const candidates = args.prediction.observations.flatMap((observation, observationIndex) => {
    if (observation.kind === "shape") return [];
    return goldItems.flatMap((item, goldIndex) => normalizeText(observation.text) === normalizeText(item.text)
      ? [{ observationIndex, goldIndex, overlap: intersectionSize(new Set(resolved[observationIndex].strokeIds), new Set(item.sourceIds)), score: 1000 + intersectionSize(new Set(resolved[observationIndex].strokeIds), new Set(item.sourceIds)) * 10 }]
      : []);
  }).sort((a, b) => b.score - a.score || a.observationIndex - b.observationIndex || a.goldIndex - b.goldIndex);
  const matchedObservation = new Map<number, number>(), matchedGold = new Set<number>();
  for (const candidate of candidates) {
    if (matchedObservation.has(candidate.observationIndex) || matchedGold.has(candidate.goldIndex)) continue;
    matchedObservation.set(candidate.observationIndex, candidate.goldIndex);
    matchedGold.add(candidate.goldIndex);
  }

  let precise = 0, partial = 0, ambiguous = 0, explicitlyAmbiguous = 0, mislocalized = 0, unlocalized = 0;
  let totalCited = 0, totalCorrectCited = 0, totalExpected = 0, totalCorrectExpected = 0, exactSupportMatches = 0, claimsWithReferences = 0;
  let invalidStrokeReferences = 0, nonStrokeReferenceClaims = 0;
  const matchedItems = [...matchedObservation].sort(([a], [b]) => a - b).map(([observationIndex, goldIndex]) => {
    const observation = args.prediction.observations[observationIndex], goldItem = goldItems[goldIndex], evidence = resolved[observationIndex];
    const cited = new Set(evidence.strokeIds), expected = new Set(goldItem.sourceIds), overlap = intersectionSize(cited, expected);
    if (observation.evidenceRefs.length) {
      claimsWithReferences++;
      totalCited += cited.size;
      totalCorrectCited += overlap;
      totalExpected += expected.size;
      totalCorrectExpected += overlap;
      if (sameSet(cited, expected)) exactSupportMatches++;
    }
    invalidStrokeReferences += evidence.invalidCount;
    if (evidence.nonStrokeCount && observation.evidenceRefs.length) nonStrokeReferenceClaims++;
    let localization: "precise" | "partial" | "ambiguous" | "mislocalized" | "unlocalized";
    if (!observation.evidenceRefs.length) localization = "unlocalized";
    else {
      const overlappingGroups = sourceGroups.filter((group) => group.sourceIds.some((id) => cited.has(id)));
      if (!cited.size || !overlap) localization = "mislocalized";
      else if (overlappingGroups.length > 1) localization = "ambiguous";
      else if (overlappingGroups.length === 1 && overlappingGroups[0].id === goldItem.id && [...cited].every((id) => expected.has(id))) localization = sameSet(cited, expected) ? "precise" : "partial";
      else localization = "mislocalized";
    }
    if (localization === "precise") precise++;
    if (localization === "partial") partial++;
    if (localization === "ambiguous") {
      ambiguous++;
      if (observation.status === "ambiguous") explicitlyAmbiguous++;
    }
    if (localization === "mislocalized") mislocalized++;
    if (localization === "unlocalized") unlocalized++;
    return { goldId: goldItem.id, predictedIndex: observationIndex, text: observation.text, localization, citedStrokeIds: [...cited].sort(), expectedStrokeIds: [...expected].sort(), sourcePrecision: cited.size ? overlap / cited.size : null, sourceRecall: expected.size ? overlap / expected.size : null };
  });

  for (const [observationIndex, observation] of args.prediction.observations.entries()) {
    if (matchedObservation.has(observationIndex) || !observation.evidenceRefs.length) continue;
    const evidence = resolved[observationIndex];
    claimsWithReferences++;
    totalCited += evidence.strokeIds.length;
    invalidStrokeReferences += evidence.invalidCount;
    if (evidence.nonStrokeCount) nonStrokeReferenceClaims++;
  }

  const relevantPredictions = args.prediction.observations.map((observation, index) => ({ observation, index })).filter(({ observation }) => observation.kind !== "shape");
  const truePositive = matchedObservation.size;
  const falsePositive = relevantPredictions.length - truePositive;
  const falseNegative = goldItems.length - matchedGold.size;
  const recognition = { goldCount: goldItems.length, predictionCount: relevantPredictions.length, truePositive, falsePositive, falseNegative, precision: ratio(truePositive, relevantPredictions.length), recall: ratio(truePositive, goldItems.length), exactTextAccuracy: ratio(truePositive, goldItems.length), matchedItems };
  const hasAnySourceReferences = args.prediction.observations.some((item) => item.evidenceRefs.length > 0);
  const sourceStrokeGrounding = {
    status: args.condition === "B" ? "not-available" as const : args.sourceLevel === "region" ? "region-only" as const : "available" as const,
    claimsWithReferences,
    precision: args.condition === "B" || !hasAnySourceReferences ? null : ratio(totalCorrectCited, totalCited),
    recall: args.condition === "B" ? null : ratio(totalCorrectExpected, goldItems.reduce((sum, item) => sum + item.sourceIds.length, 0)),
    exactSupportMatches,
    invalidStrokeReferences: invalidStrokeReferences + (args.rejectedReferenceCount ?? 0),
    nonStrokeReferenceClaims,
    citedStrokeCount: totalCited,
    correctlyCitedStrokeCount: totalCorrectCited,
    expectedStrokeCount: goldItems.reduce((sum, item) => sum + item.sourceIds.length, 0),
  };
  const spatialAssociation = {
    precise,
    partial,
    ambiguous,
    explicitlyAmbiguous,
    unacknowledgedAmbiguity: ambiguous - explicitlyAmbiguous,
    mislocalized,
    unlocalized,
    precision: args.condition === "B" ? null : ratio(precise + partial, claimsWithReferences),
    recall: args.condition === "B" ? null : ratio(precise + partial, goldItems.length),
    evidenceLevel: args.condition === "B" ? "none" : args.sourceLevel ?? "item",
  };

  const relationResult = scoreRelations(args.gold.relations, args.prediction, matchedObservation, goldItems, args.knownStrokeIds, args.candidateSources);
  const formulaClaims = args.prediction.interpretations.filter((item) => /\bmethane\b|\bch\s*4\b|\bch₄\b|\bh\s*4\s*c\b/i.test(item.claim));
  const expectedFormulaToken = args.gold.expectedFormula?.formula.replace(/\s+/g, "").replace(/[₀-₉]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0x2080 + 48));
  const formulaMatchesTarget = formulaClaims.some((item) => /\bmethane\b/i.test(item.claim) || (expectedFormulaToken ? item.claim.normalize("NFKC").replace(/\s+/g, "").toUpperCase().includes(expectedFormulaToken.toUpperCase()) : false));
  const targetStrokeIds = new Set(args.gold.targetSourceIds ?? [...args.gold.textItems.flatMap((item) => item.sourceIds), ...args.gold.relations.flatMap((relation) => relation.evidenceIds)]);
  const formulaSupportingIds = new Set(formulaClaims.flatMap((item) => resolveReferences(item.evidenceRefs, args.knownStrokeIds, args.candidateSources).strokeIds));
  const formulaSupportCoverage = formulaClaims.length ? ratio(intersectionSize(formulaSupportingIds, targetStrokeIds), targetStrokeIds.size) : null;
  const formulaQualified = formulaClaims.some((item) => item.status === "ambiguous") || relationResult.ambiguousAcknowledged > 0 || args.prediction.ambiguities.some(acknowledgesTargetConnectorAmbiguity);
  const clearRelationCount = args.gold.relations.filter((relation) => relation.state === "clear").length;
  const ambiguousRelationCount = args.gold.relations.filter((relation) => relation.state === "uncertain").length;
  const atomInventoryCorrect = falsePositive === 0 && falseNegative === 0;
  const bondTopologyCorrect = relationResult.clearTruePositives === clearRelationCount && relationResult.ambiguousAcknowledged === ambiguousRelationCount && relationResult.falseAssociations === 0;
  const groundedGraphCorrect = atomInventoryCorrect && bondTopologyCorrect && precise === goldItems.length && relationResult.exactEvidenceMatches === relationResult.matchedRelationCount;
  const scientificInterpretation = {
    formulaMentioned: formulaClaims.length > 0,
    formulaClaimCount: formulaClaims.length,
    formulaMatchesTarget: formulaClaims.length ? formulaMatchesTarget : null,
    formulaConditionallyQualified: formulaClaims.length > 0 && formulaQualified,
    formulaSourceCoverage: formulaSupportCoverage,
    formulaAloneCountsAsSceneUnderstanding: false,
    atomInventoryCorrect,
    bondTopologyCorrect,
    groundedGraphCorrect,
    fullGroundedSceneUnderstanding: groundedGraphCorrect,
  };
  return { recognition, sourceStrokeGrounding, spatialAssociation, relations: relationResult, scientificInterpretation };
}

function acknowledgesTargetConnectorAmbiguity(text: string) {
  const uncertainty = /\b(?:uncertain|ambiguous|detached|separated|unclear|not clearly|may|might|could)\b/i;
  return /\b(?:left|horizontal)\s+(?:bond|connector|line|mark|connection|edge)\b/i.test(text) && uncertainty.test(text);
}

function scoreRelations(goldRelations: readonly SceneGoldRelation[], prediction: ScenePrediction, matchedObservation: ReadonlyMap<number, number>, goldItems: SceneGoldItem[], knownStrokeIds: ReadonlySet<string>, candidateSources: ReadonlyMap<string, readonly string[]>) {
  const resolved = prediction.relations.map((relation) => resolveReferences(relation.evidenceRefs, knownStrokeIds, candidateSources));
  const used = new Set<number>(), matches: Array<{ predictionIndex: number; goldId: string | null; status: "matched" | "ambiguous-source" | "false-association"; citedStrokeIds: string[]; expectedStrokeIds: string[]; exactEvidence: boolean }> = [];
  let exactEvidenceMatches = 0, matchedRelationCount = 0, totalCited = 0, totalCorrectCited = 0, totalExpected = 0, totalCorrectExpected = 0;
  for (const [predictionIndex, relation] of prediction.relations.entries()) {
    const evidence = resolved[predictionIndex], cited = new Set(evidence.strokeIds);
    totalCited += cited.size;
    const endpoints = relation.from !== undefined && relation.to !== undefined
      ? [matchedObservation.get(relation.from), matchedObservation.get(relation.to)]
      : [];
    const endpointCandidates = endpointRelations(relation, endpoints, matchedObservation, goldItems, goldRelations);
    let possible = endpointCandidates;
    if (cited.size) {
      const byEvidence = possible.filter((item) => item.evidenceIds.some((id) => cited.has(id)));
      if (byEvidence.length) possible = byEvidence;
    }
    const semantic = /\b(bond|connect|attach|link)\w*/i.test(relation.relation);
    if (!semantic || !possible.length) {
      matches.push({ predictionIndex, goldId: null, status: "false-association", citedStrokeIds: [...cited].sort(), expectedStrokeIds: [], exactEvidence: false });
      continue;
    }
    const ordered = [...possible].sort((a, b) => {
      const statusA = relation.status === "ambiguous" ? a.state === "uncertain" ? 0 : 1 : a.state === "clear" ? 0 : 1;
      const statusB = relation.status === "ambiguous" ? b.state === "uncertain" ? 0 : 1 : b.state === "clear" ? 0 : 1;
      const overlapA = intersectionSize(cited, new Set(a.evidenceIds)), overlapB = intersectionSize(cited, new Set(b.evidenceIds));
      return statusA - statusB || overlapB - overlapA || a.id.localeCompare(b.id);
    });
    const selected = ordered.find((item) => !used.has(goldRelations.indexOf(item)));
    if (!selected) {
      matches.push({ predictionIndex, goldId: null, status: "false-association", citedStrokeIds: [...cited].sort(), expectedStrokeIds: [], exactEvidence: false });
      continue;
    }
    const selectedIndex = goldRelations.indexOf(selected), expected = new Set(selected.evidenceIds), overlap = intersectionSize(cited, expected);
    used.add(selectedIndex);
    const sourceAmbiguous = cited.size > 0 && ([...cited].some((id) => !expected.has(id)) || evidence.nonStrokeCount > 0);
    const exactEvidence = sameSet(cited, expected);
    matches.push({ predictionIndex, goldId: selected.id, status: sourceAmbiguous ? "ambiguous-source" : "matched", citedStrokeIds: [...cited].sort(), expectedStrokeIds: [...expected].sort(), exactEvidence });
    matchedRelationCount++;
    totalCorrectCited += overlap;
    totalExpected += expected.size;
    totalCorrectExpected += overlap;
    if (exactEvidence && !sourceAmbiguous) exactEvidenceMatches++;
  }
  const clearGold = goldRelations.filter((item) => item.state === "clear").length, ambiguousGold = goldRelations.filter((item) => item.state === "uncertain").length;
  const clearTruePositives = matches.filter((match) => match.goldId && goldRelations.find((item) => item.id === match.goldId)?.state === "clear").length;
  const ambiguousAcknowledged = matches.filter((match) => prediction.relations[match.predictionIndex].status === "ambiguous" && match.goldId && goldRelations.find((item) => item.id === match.goldId)?.state === "uncertain").length;
  const ambiguousMisses = matches.filter((match) => match.goldId && goldRelations.find((item) => item.id === match.goldId)?.state === "uncertain" && prediction.relations[match.predictionIndex].status !== "ambiguous").length + Math.max(0, ambiguousGold - matches.filter((match) => match.goldId && goldRelations.find((item) => item.id === match.goldId)?.state === "uncertain").length);
  const falseAssociations = matches.filter((match) => match.status === "false-association").length;
  const clearFalseNegatives = clearGold - clearTruePositives;
  const anyRefs = prediction.relations.some((item) => item.evidenceRefs.length > 0);
  return {
    clearGoldCount: clearGold,
    clearTruePositives,
    clearFalseNegatives,
    falseAssociations,
    associationPrecision: anyRefs ? ratio(clearTruePositives, clearTruePositives + falseAssociations) : ratio(clearTruePositives, prediction.relations.length),
    associationRecall: ratio(clearTruePositives, clearGold),
    ambiguousGoldCount: ambiguousGold,
    ambiguousAcknowledged,
    ambiguousMisses,
    relationEvidencePrecision: anyRefs ? ratio(totalCorrectCited, totalCited) : null,
    relationEvidenceRecall: anyRefs ? ratio(totalCorrectExpected, totalExpected) : null,
    exactEvidenceMatches,
    matchedRelationCount,
    referenceEvidenceLevel: anyRefs ? "stroke-or-candidate" : "none",
    matches,
  };
}

function endpointRelations(relation: ScenePrediction["relations"][number], endpoints: Array<number | undefined>, matchedObservation: ReadonlyMap<number, number>, goldItems: SceneGoldItem[], goldRelations: readonly SceneGoldRelation[]) {
  if (relation.fromSourceId && relation.toSourceId) {
    const from = goldItems.find((item) => item.sourceIds.includes(relation.fromSourceId!)), to = goldItems.find((item) => item.sourceIds.includes(relation.toSourceId!));
    if (from && to) return goldRelations.filter((item) => (item.from === from.id && item.to === to.id) || (item.from === to.id && item.to === from.id));
  }
  if (endpoints.length === 2 && endpoints.every((value) => value !== undefined)) {
    const from = goldItems[endpoints[0]!], to = goldItems[endpoints[1]!];
    const exact = goldRelations.filter((item) => (item.from === from.id && item.to === to.id) || (item.from === to.id && item.to === from.id));
    if (exact.length) return exact;
  }
  if (relation.from === undefined || relation.to === undefined) return [];
  const fromText = relationTextAt(relation.from, matchedObservation, goldItems), toText = relationTextAt(relation.to, matchedObservation, goldItems);
  return goldRelations.filter((item) => {
    const a = goldItems.find((candidate) => candidate.id === item.from)?.text, b = goldItems.find((candidate) => candidate.id === item.to)?.text;
    return normalizeText(fromText) === normalizeText(a ?? "") && normalizeText(toText) === normalizeText(b ?? "") || normalizeText(fromText) === normalizeText(b ?? "") && normalizeText(toText) === normalizeText(a ?? "");
  });
}

function relationTextAt(index: number, matchedObservation: ReadonlyMap<number, number>, goldItems: SceneGoldItem[]) {
  const goldIndex = matchedObservation.get(index);
  return goldIndex === undefined ? "" : goldItems[goldIndex]?.text ?? "";
}

function resolveReferences(references: readonly SceneEvidenceRef[], knownStrokeIds: ReadonlySet<string>, candidateSources: ReadonlyMap<string, readonly string[]>) {
  const strokeIds = new Set<string>();
  let invalidCount = 0, nonStrokeCount = 0;
  for (const reference of references) {
    if (reference.kind === "stroke") {
      if (knownStrokeIds.has(reference.id)) strokeIds.add(reference.id);
      else invalidCount++;
    } else if (reference.kind === "candidate") {
      const members = candidateSources.get(reference.id);
      if (!members) invalidCount++;
      else for (const id of members) { if (knownStrokeIds.has(id)) strokeIds.add(id); else invalidCount++; }
    } else nonStrokeCount++;
  }
  return { strokeIds: [...strokeIds].sort(), invalidCount, nonStrokeCount };
}

function normalizeText(value: string) { return value.normalize("NFKC").replace(/\s+/g, "").trim(); }
function intersectionSize(a: ReadonlySet<string>, b: ReadonlySet<string>) { let count = 0; for (const item of a) if (b.has(item)) count++; return count; }
function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) { return a.size === b.size && intersectionSize(a, b) === a.size; }
function ratio(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }
