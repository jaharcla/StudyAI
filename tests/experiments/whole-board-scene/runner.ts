import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import type { Page } from "@playwright/test";
import { parseCanvasDocument } from "../../../src/canvas/model.js";
import { produceCanvasAnalysisForPersistedBoard, type CanvasAnalysisRequest } from "../../../server/canvas-analysis/producer.js";
import { clearCanvasRecognitionCache, understandCanvas } from "../../../server/canvas-intelligence/service.js";
import { normalizeCanvasInput } from "../../../server/canvas-intelligence/input.js";
import { canvasInferenceProvider, canvasOCRProvider, groqOCRModel } from "../../../server/canvas-intelligence/groq.js";
import { allowedEvidenceForCondition, buildSceneConditionPayload, buildSceneSourcePayload, buildStrokeCandidates, createSceneRequestBudget, expandEvidenceReferences, MAX_SCENE_EXPERIMENT_REQUESTS, scoreStrokeGroups } from "../../../server/canvas-intelligence/scene-experiment.js";
import { groqSceneExperimentCall } from "../../../server/canvas-intelligence/scene-experiment-groq.js";
import type { CanvasInput, OCRImageRegion } from "../../../server/canvas-intelligence/types.js";
import { evaluateScenePredictions, type SceneGold, type ScenePrediction } from "./evaluation.js";

type PersistedBoardRow = { id: string; course_id: string; lesson_id: string; name: string; document: string; revision: number; updated_at: string };

export type LoadedSceneBoard = { dbPath: string; row: PersistedBoardRow; document: ReturnType<typeof parseCanvasDocument>; input: CanvasInput; documentHash: string; dbHash: string; storeShapeCount: number; fixtureSource: { documentSha256: string; expectedHandwritingSourceIds: string[] } };
export type SceneCapture = { png: Buffer; base64: string; pngSha256: string; width: number; height: number; imageBytes: number; worldBounds: { x: number; y: number; width: number; height: number }; paddingPixels: number; camera: { x: number; y: number; z: number }; allSourceBoundsCovered: boolean; sourceSnapshotSha256Before: string; sourceSnapshotSha256After: string; probe: { width: number; height: number; viewSize: { w: number; h: number }; shapeCount: number; scienceObjectCount: number; scientificLayerBounds: { x: number; y: number; width: number; height: number }; worldRoundTrips: Array<{ error: number }> }; regions: OCRImageRegion[] };

export function loadSavedSceneBoard(dbPath: string, boardId = "preserved-quickdraw-sample"): LoadedSceneBoard {
  const resolvedPath = resolve(dbPath), dbHash = sha256(readFileSync(resolvedPath));
  const database = new Database(resolvedPath, { readonly: true, fileMustExist: true });
  database.pragma("query_only = ON");
  const row = database.prepare("SELECT id,course_id,lesson_id,name,document,revision,updated_at FROM canvases WHERE id=?").get(boardId) as PersistedBoardRow | undefined;
  database.close();
  if (!row) throw new Error(`Saved canvas ${boardId} was not found in the read-only source database.`);
  const documentHash = sha256(Buffer.from(row.document, "utf8"));
  const fixture = JSON.parse(readFileSync(new URL("../../fixtures/canvas-grounding/preserved-quickdraw-sample.json", import.meta.url), "utf8")) as { source: { documentSha256: string }; expectedHandwritingSourceIds: string[] };
  if (documentHash !== fixture.source.documentSha256) throw new Error(`Source canvas document hash does not match the preserved fixture: ${documentHash}`);
  if (row.revision !== 95) throw new Error(`Expected preserved source revision 95, received ${row.revision}.`);
  const document = parseCanvasDocument(JSON.parse(row.document));
  const input = normalizeCanvasInput({ boardId: row.id, courseId: row.course_id, lessonId: row.lesson_id, snapshot: document.snapshot, scientificObjects: document.objects });
  const store = document.snapshot.document.store;
  const storeShapeCount = Object.values(store).filter((record) => record.typeName === "shape").length;
  return { dbPath: resolvedPath, row, document, input, documentHash, dbHash, storeShapeCount, fixtureSource: { documentSha256: fixture.source.documentSha256, expectedHandwritingSourceIds: fixture.expectedHandwritingSourceIds } };
}

export function createSceneBootstrap(input: CanvasInput, document: ReturnType<typeof parseCanvasDocument>, scale = 1.25, padding = 56) {
  const bounds = [
    ...input.nativeRecords.flatMap((record) => record.bounds ? [record.bounds] : []),
    ...input.scientificObjects.map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height })),
  ];
  if (!bounds.length) throw new Error("Saved scene has no renderable bounds.");
  const minX = Math.min(...bounds.map((item) => item.x)), minY = Math.min(...bounds.map((item) => item.y));
  const maxX = Math.max(...bounds.map((item) => item.x + item.width)), maxY = Math.max(...bounds.map((item) => item.y + item.height));
  const worldBounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  const width = Math.ceil(worldBounds.width * scale + padding * 2), height = Math.ceil(worldBounds.height * scale + padding * 2);
  const camera = { x: padding / scale - minX, y: padding / scale - minY, z: scale };
  return { bootstrap: { snapshot: document.snapshot, objects: document.objects, camera, width, height }, worldBounds, paddingPixels: padding };
}

export async function captureScene(page: Page, input: CanvasInput, document: ReturnType<typeof parseCanvasDocument>): Promise<SceneCapture> {
  const { bootstrap, worldBounds, paddingPixels } = createSceneBootstrap(input, document);
  const sourceSnapshotSha256Before = sha256(Buffer.from(JSON.stringify(document.snapshot), "utf8"));
  await page.setViewportSize({ width: bootstrap.width, height: bootstrap.height });
  const bootstrapJson = JSON.stringify(bootstrap);
  await page.addInitScript((sceneJson) => { window.__STUDYAI_SCENE__ = JSON.parse(sceneJson); }, bootstrapJson);
  await page.goto("/tests/experiments/whole-board-scene/renderer.html");
  await page.locator('#scene[data-ready="true"]').waitFor({ state: "visible", timeout: 30_000 });
  const probe = await page.evaluate(async () => {
    if (!window.__STUDYAI_SCENE_PROBE__) throw new Error("Scene renderer did not publish its read-only probe.");
    const { crops, ...metadata } = await window.__STUDYAI_SCENE_PROBE__();
    return { crops, metadata };
  });
  const png = await page.locator("#scene").screenshot({ animations: "disabled", caret: "hide" });
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const expectedShapeCount = Object.values(document.snapshot.document.store).filter((record) => record.typeName === "shape").length;
  if (probe.metadata.shapeCount !== expectedShapeCount) throw new Error(`Renderer loaded ${probe.metadata.shapeCount} QuickDraw shapes; saved snapshot contains ${expectedShapeCount}.`);
  if (probe.metadata.scienceObjectCount !== input.scientificObjects.length) throw new Error("Renderer did not receive every saved scientific object.");
  if (Math.abs(probe.metadata.scientificLayerBounds.width - width) > 1 || Math.abs(probe.metadata.scientificLayerBounds.height - height) > 1) throw new Error("Scientific SVG layer does not cover the full submitted image.");
  if (probe.metadata.worldRoundTrips.some((item) => item.error > 1)) throw new Error("World/screen coordinate round trip exceeds one output pixel.");
  if (probe.metadata.width !== width || probe.metadata.height !== height) throw new Error("Rendered root and submitted PNG dimensions do not match.");
  const allBounds = [...input.nativeRecords.flatMap((record) => record.bounds ? [record.bounds] : []), ...input.scientificObjects.map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height }))];
  const epsilon = 0.01;
  const allSourceBoundsCovered = allBounds.every((bounds) => bounds.x >= worldBounds.x - epsilon && bounds.y >= worldBounds.y - epsilon && bounds.x + bounds.width <= worldBounds.x + worldBounds.width + epsilon && bounds.y + bounds.height <= worldBounds.y + worldBounds.height + epsilon);
  if (!allSourceBoundsCovered) throw new Error("At least one saved source object lies outside the rendered whole-scene bounds.");
  const sourceSnapshotSha256After = sha256(Buffer.from(JSON.stringify(document.snapshot), "utf8"));
  if (sourceSnapshotSha256Before !== sourceSnapshotSha256After) throw new Error("Read-only renderer changed the in-memory source snapshot.");
  const base64 = png.toString("base64");
  return { png, base64, pngSha256: sha256(png), width, height, imageBytes: png.length, worldBounds, paddingPixels, camera: bootstrap.camera, allSourceBoundsCovered, sourceSnapshotSha256Before, sourceSnapshotSha256After, probe: probe.metadata, regions: probe.crops };
}

export function saveCaptureArtifacts(runDirectory: string, board: LoadedSceneBoard, capture: SceneCapture) {
  mkdirSync(runDirectory, { recursive: true });
  const capturePath = join(runDirectory, "capture.json"), imagePath = join(runDirectory, "whole-scene.png");
  if (existsSync(imagePath) && sha256(readFileSync(imagePath)) !== capture.pngSha256) throw new Error("Existing capture artifact differs from the current rendering; use a new experiment run ID.");
  if (!existsSync(imagePath)) writeFileSync(imagePath, capture.png);
  for (const [index, region] of capture.regions.entries()) {
    const cropPath = join(runDirectory, `baseline-crop-${String(index + 1).padStart(2, "0")}.png`);
    const crop = Buffer.from(region.base64, "base64");
    if (!existsSync(cropPath)) writeFileSync(cropPath, crop);
  }
  const captureMetadata = {
    boardId: board.row.id,
    courseId: board.row.course_id,
    lessonId: board.row.lesson_id,
    revision: board.row.revision,
    updatedAt: board.row.updated_at,
    documentHash: board.documentHash,
    databaseHashBefore: board.dbHash,
    sceneImageSha256: capture.pngSha256,
    dimensions: { width: capture.width, height: capture.height },
    imageBytes: capture.imageBytes,
    pixelsPerWorldUnit: capture.camera.z,
    worldBounds: capture.worldBounds,
    camera: capture.camera,
    paddingPixels: capture.paddingPixels,
    shapeCount: capture.probe.shapeCount,
    normalizedRecordCount: board.input.nativeRecords.length,
    scientificObjectCount: capture.probe.scienceObjectCount,
    scientificLayerBounds: capture.probe.scientificLayerBounds,
    roundTripErrorsPixels: capture.probe.worldRoundTrips.map((item) => item.error),
    allSourceBoundsCovered: capture.allSourceBoundsCovered,
    sourceSnapshotSha256Before: capture.sourceSnapshotSha256Before,
    sourceSnapshotSha256After: capture.sourceSnapshotSha256After,
    sourceStrokeCount: buildSceneSourcePayload(board.input).strokes.length,
    sourceObjectCount: buildSceneSourcePayload(board.input).objects.length,
    baselineCropCount: capture.regions.length,
    baselineCrops: capture.regions.map(({ base64: _base64, ...region }, index) => ({ file: `baseline-crop-${String(index + 1).padStart(2, "0")}.png`, ...region })),
    baselineOmittedInkIds: board.input.nativeRecords.filter((record) => (record.type === "draw" || record.type === "highlight") && !capture.regions.some((region) => region.sourceIds.includes(record.id))).map((record) => record.id),
    resolutionReview: process.env.STUDYAI_WHOLE_BOARD_CAPTURE_REVIEWED_SHA256 === capture.pngSha256 ? "reviewed-by-run-operator" : "pending",
  };
  if (existsSync(capturePath)) {
    const existing = JSON.parse(readFileSync(capturePath, "utf8")) as { sceneImageSha256?: string };
    if (existing.sceneImageSha256 !== captureMetadata.sceneImageSha256) throw new Error("Capture metadata belongs to a different rendered image; use a new experiment run ID.");
  }
  writeFileSync(capturePath, `${JSON.stringify(captureMetadata, null, 2)}\n`);
  return captureMetadata;
}

export function captureGateReason(metadata: ReturnType<typeof saveCaptureArtifacts>) {
  if (metadata.resolutionReview !== "reviewed-by-run-operator") return "The exact submitted image has not been visually reviewed at native resolution; no Groq calls were made.";
  if (!metadata.allSourceBoundsCovered) return "Whole-scene image does not cover every source object; no Groq calls were made.";
  if (metadata.sourceSnapshotSha256Before !== metadata.sourceSnapshotSha256After) return "Read-only capture changed the source snapshot; no Groq calls were made.";
  if (metadata.roundTripErrorsPixels.some((value) => value > 1)) return "World-coordinate alignment did not pass; no Groq calls were made.";
  if (metadata.baselineCropCount > 3) return "Baseline crop count exceeds the existing three-region limit; no Groq calls were made.";
  return null;
}

export async function runFourConditions(args: { board: LoadedSceneBoard; capture: SceneCapture; runDirectory: string }) {
  if (canvasInferenceProvider() !== "groq" || canvasOCRProvider() !== "groq") throw new Error("The configured canvas providers are not both Groq; provider settings were not changed.");
  const budget = createSceneRequestBudget(MAX_SCENE_EXPERIMENT_REQUESTS);
  const gold = JSON.parse(readFileSync(new URL("../../fixtures/canvas-grounding/methane-scene-ground-truth.json", import.meta.url), "utf8")) as SceneGold;
  if (gold.sourceHash !== args.board.documentHash) throw new Error("Ground-truth annotation source hash does not match the frozen saved board.");
  const sourcePayload = buildSceneSourcePayload(args.board.input);
  const candidates = buildStrokeCandidates(args.board.input);
  const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate.sourceIds]));
  const strokeIds = new Set(sourcePayload.strokes.map((stroke) => stroke.id));
  const sourceObjectIds = new Set(sourcePayload.objects.map((object) => object.id));
  const targetStrokeIds = new Set((gold as SceneGold & { targetSourceIds?: string[] }).targetSourceIds ?? gold.textItems.flatMap((item) => item.sourceIds));
  if ([...targetStrokeIds].some((id) => !strokeIds.has(id))) throw new Error("Reviewed target source IDs do not resolve to the frozen saved board.");
  const grouping = scoreStrokeGroups(candidates, gold.strokeGroups.filter((group) => group.state === "clear"), strokeIds);
  const candidateFeatures = new Map(candidates.flatMap((candidate) => candidate.features.strokes.map((stroke) => [stroke.sourceId, { start: stroke.start, end: stroke.end }] as const)));
  const geometryReview = reviewGoldGeometry(gold, args.board.input, candidateFeatures);

  const memory = new Database(":memory:");
  memory.exec("CREATE TABLE lessons(id TEXT NOT NULL,course_id TEXT NOT NULL,PRIMARY KEY(course_id,id)); CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT NOT NULL,lesson_id TEXT NOT NULL,name TEXT NOT NULL,document TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL);");
  memory.prepare("INSERT INTO lessons(id,course_id) VALUES(?,?)").run(args.board.row.lesson_id, args.board.row.course_id);
  memory.prepare("INSERT INTO canvases(id,course_id,lesson_id,name,document,revision,updated_at) VALUES(?,?,?,?,?,?,?)").run(args.board.row.id, args.board.row.course_id, args.board.row.lesson_id, args.board.row.name, args.board.row.document, args.board.row.revision, args.board.row.updated_at);

  const baselineStarted = performance.now();
  let conditionA: unknown;
  clearCanvasRecognitionCache();
  try {
    const request: CanvasAnalysisRequest = { expectedRevision: args.board.row.revision, document: args.board.document, selectedIds: [], image: { mimeType: "image/png", regions: args.capture.regions } };
    conditionA = await produceCanvasAnalysisForPersistedBoard(memory, { boardId: args.board.row.id, courseId: args.board.row.course_id, lessonId: args.board.row.lesson_id }, request, { analyze: (input) => understandCanvas({ ...input, fetcher: budget.fetcherFor("A") }) });
  } catch (error) {
    conditionA = { status: "failed", error: error instanceof Error ? error.message : String(error) };
  } finally {
    memory.close();
  }
  const conditionAResult: Record<string, any> = { condition: "A", status: isRecord(conditionA) && "schemaVersion" in conditionA ? conditionA.analysisStatus ?? "complete" : "failed", runtimeMs: performance.now() - baselineStarted, result: conditionA };
  const conditionAPrediction = baselinePrediction(conditionA, strokeIds, sourceObjectIds);
  if (conditionAPrediction) conditionAResult.evaluation = evaluateScenePredictions({ condition: "A", gold, prediction: conditionAPrediction, knownStrokeIds: strokeIds, candidateSources: candidateMap, sourceLevel: "region" });
  conditionAResult.inputCoverage = measureInputCoverage("A", gold, args.board.input, args.capture, sourcePayload, candidates);

  const conditionResults: Array<Record<string, unknown>> = [conditionAResult];
  for (const condition of ["B", "C", "D"] as const) {
    const payload = buildSceneConditionPayload(condition, args.board.input, { width: args.capture.width, height: args.capture.height });
    const serialized = JSON.stringify(payload);
    if (/methane|CH4|expectedHandwritingSourceIds|groundTruth|ground-truth/i.test(serialized)) throw new Error(`Condition ${condition} payload contains forbidden target or fixture metadata.`);
    writeFileSync(join(args.runDirectory, `condition-${condition}-input.json`), `${JSON.stringify(payload, null, 2)}\n`);
    const started = performance.now();
    try {
      const allowed = allowedEvidenceForCondition(condition, sourcePayload, candidates);
      const response = await groqSceneExperimentCall({ payload, imageBase64: args.capture.base64, allowedStrokeIds: allowed.strokeIds, allowedSourceObjectIds: allowed.sourceObjectIds, allowedCandidateIds: allowed.candidateIds, fetcher: budget.fetcherFor(condition) });
      const proposal = response.proposal;
      const sourceClaims = proposal?.observations.map((item) => ({ text: item.text, evidence: item.evidenceRefs.map((reference) => expandEvidenceReferences([reference], strokeIds, sourceObjectIds, candidateMap)) })) ?? [];
      const prediction = proposal as ScenePrediction | null;
      const result: Record<string, any> = { condition, status: proposal ? "complete" : "invalid-response", model: response.model, finishReason: response.finishReason, runtimeMs: performance.now() - started, validationError: response.validationError, rejectedReferences: response.rejectedReferences, proposal, sourceClaims, rawOutput: response.rawText, inputCoverage: measureInputCoverage(condition, gold, args.board.input, args.capture, sourcePayload, candidates) };
      if (prediction) result.evaluation = evaluateScenePredictions({ condition, gold, prediction, knownStrokeIds: strokeIds, candidateSources: candidateMap, rejectedReferenceCount: response.rejectedReferences.length });
      conditionResults.push(result);
    } catch (error) {
      conditionResults.push({ condition, status: "failed", runtimeMs: performance.now() - started, error: error instanceof Error ? error.message : String(error), inputCoverage: measureInputCoverage(condition, gold, args.board.input, args.capture, sourcePayload, candidates) });
    }
  }
  const requestRecords = budget.records;
  for (const condition of conditionResults) condition.failureClassifications = classifyConditionFailures(condition, grouping, gold);
  const sourceRowAfter = readSourceRow(args.board.dbPath, args.board.row.id);
  const dbHashAfter = sha256(readFileSync(args.board.dbPath));
  const immutable = sourceRowAfter.document === args.board.row.document && sourceRowAfter.revision === args.board.row.revision && sourceRowAfter.updated_at === args.board.row.updated_at && dbHashAfter === args.board.dbHash;
  const requestUsage = summarizeRequestUsage(requestRecords);
  const report = {
    experiment: "whole-board-scene-feasibility-phase-1",
    board: { id: args.board.row.id, courseId: args.board.row.course_id, lessonId: args.board.row.lesson_id, revision: args.board.row.revision, documentHash: args.board.documentHash, name: args.board.row.name },
    target: { type: "freehand-molecular-sketch", sourceIds: [...targetStrokeIds].sort(), visibleFormulaOrNameLeakage: false, groundTruthReview: (gold as SceneGold & { review?: unknown }).review },
    feasibilityOnly: true,
    datasetToCanvasBenchmarkModified: false,
    capture: { imageSha256: args.capture.pngSha256, width: args.capture.width, height: args.capture.height, imageBytes: args.capture.imageBytes, pixelsPerWorldUnit: args.capture.camera.z, worldBounds: args.capture.worldBounds, allSourceBoundsCovered: args.capture.allSourceBoundsCovered, fullSceneImageSent: ["B", "C", "D"], baselineImageMode: "three selected crops", sourceSnapshotUnchanged: args.capture.sourceSnapshotSha256Before === args.capture.sourceSnapshotSha256After },
    conditions: conditionResults,
    cropSelection: { selected: args.capture.regions.map(({ base64: _base64, ...region }) => region), omittedInkIds: args.board.input.nativeRecords.filter((record) => (record.type === "draw" || record.type === "highlight") && !args.capture.regions.some((region) => region.sourceIds.includes(record.id))).map((record) => record.id), targetOmittedInkIds: [...targetStrokeIds].filter((id) => !args.capture.regions.some((region) => region.sourceIds.includes(id))).sort(), targetCapturedInkIds: [...targetStrokeIds].filter((id) => args.capture.regions.some((region) => region.sourceIds.includes(id))).sort() },
    groupingMetrics: grouping,
    geometryReview,
    sourceCounts: { normalizedRecords: args.board.input.nativeRecords.length, freehandStrokes: sourcePayload.strokes.length, freehandStrokePoints: sourcePayload.strokes.reduce((sum, stroke) => sum + stroke.points.length / 3, 0), sourceObjects: sourcePayload.objects.length, scientificObjects: args.board.input.scientificObjects.length, candidateGroups: candidates.length, candidateSourceReferences: candidates.reduce((sum, candidate) => sum + candidate.sourceIds.length, 0) },
    groq: { configuredOCRModel: groqOCRModel(), configuredInferenceModel: process.env.CANVAS_GROQ_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-120b", requestBudget: MAX_SCENE_EXPERIMENT_REQUESTS, requestsUsed: budget.attempts, requestsRemaining: MAX_SCENE_EXPERIMENT_REQUESTS - budget.attempts, usage: requestUsage, exactCost: null, exactCostReason: "Not computed: provider usage is recorded, but no pinned, run-dated pricing schedule was applied.", records: requestRecords },
    sourceImmutability: { verified: immutable, documentHashBefore: args.board.documentHash, documentHashAfter: sha256(Buffer.from(sourceRowAfter.document, "utf8")), revisionBefore: args.board.row.revision, revisionAfter: sourceRowAfter.revision, updatedAtBefore: args.board.row.updated_at, updatedAtAfter: sourceRowAfter.updated_at, databaseHashBefore: args.board.dbHash, databaseHashAfter: dbHashAfter },
    limitations: ["The target's left connector is visually ambiguous; CH4 is conditional on treating it as a bond.", "A second native QuickDraw depiction with similar atom symbols is visible in the full-scene image but excluded from the primary freehand target score.", "Ground truth has one visual reviewer; reviewer disagreement and inter-rater reliability are not measured.", "One saved board is a feasibility case study and does not measure overall readiness for mixed-tool canvases."],
  };
  writeFileSync(join(args.runDirectory, "provider-requests.json"), `${JSON.stringify(requestRecords, null, 2)}\n`);
  writeFileSync(join(args.runDirectory, "scene-source-evidence.json"), `${JSON.stringify(sourcePayload, null, 2)}\n`);
  writeFileSync(join(args.runDirectory, "condition-results.json"), `${JSON.stringify(conditionResults, null, 2)}\n`);
  writeFileSync(join(args.runDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(args.runDirectory, "report.md"), renderMarkdownReport(report, gold, conditionResults, grouping));
  writeFileSync(join(args.runDirectory, "capture-only.txt"), "Capture gate passed; the isolated four-condition run completed.\n");
  return report;
}

function readSourceRow(dbPath: string, boardId: string) {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  database.pragma("query_only = ON");
  const row = database.prepare("SELECT id,course_id,lesson_id,name,document,revision,updated_at FROM canvases WHERE id=?").get(boardId) as PersistedBoardRow | undefined;
  database.close();
  if (!row) throw new Error("Source canvas disappeared from the read-only database.");
  return row;
}

function sha256(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function ratio(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }

function baselinePrediction(value: unknown, strokeIds: ReadonlySet<string>, sourceObjectIds: ReadonlySet<string>): ScenePrediction | null {
  if (!isRecord(value) || !isRecord(value.observedEvidence) || !Array.isArray(value.observedEvidence.items)) return null;
  const refs = (ids: unknown) => Array.isArray(ids) ? ids.flatMap((id) => typeof id !== "string" ? [] : [{ kind: strokeIds.has(id) ? "stroke" as const : "source-object" as const, id }]) : [];
  const observations = value.observedEvidence.items.filter((item: any) => item?.origin === "ocr" && typeof item.text === "string").map((item: any) => ({
    text: item.text,
    kind: /^[A-Z][a-z]?$/.test(item.text.trim()) ? "symbol" : /\d/.test(item.text) ? "number" : "text",
    status: item.uncertain ? "ambiguous" : "proposed",
    evidenceRefs: refs(item.sourceRegion?.sourceIds?.length ? item.sourceRegion.sourceIds : item.sourceIds),
  }));
  const relationships = Array.isArray(value.relationships) ? value.relationships : [];
  const relations = relationships.map((item: any) => ({
    fromSourceId: typeof item.fromId === "string" ? item.fromId : undefined,
    toSourceId: typeof item.toId === "string" ? item.toId : undefined,
    relation: typeof item.relation === "string" ? item.relation : "unknown",
    status: item.classification === "inferred" ? "ambiguous" : "proposed",
    evidenceRefs: refs(item.sourceIds),
  }));
  const inferred = isRecord(value.inferredInterpretations) && Array.isArray(value.inferredInterpretations.items) ? value.inferredInterpretations.items : [];
  const interpretations = inferred.filter((item: any) => typeof item?.statement === "string").map((item: any) => ({ claim: item.statement, status: Array.isArray(item.uncertainty) && item.uncertainty.length ? "ambiguous" : "proposed", evidenceRefs: refs(item.sourceObjectIds) }));
  const uncertainties = Array.isArray(value.uncertainty) ? value.uncertainty : [];
  const ambiguities = uncertainties.map((item: unknown) => typeof item === "string" ? item : JSON.stringify(item));
  return { observations, relations, interpretations, ambiguities };
}

function measureInputCoverage(condition: "A" | "B" | "C" | "D", gold: SceneGold, input: CanvasInput, capture: SceneCapture, sourcePayload: ReturnType<typeof buildSceneSourcePayload>, candidates: ReturnType<typeof buildStrokeCandidates>) {
  const targetIds = new Set(gold.targetSourceIds ?? gold.textItems.flatMap((item) => item.sourceIds));
  const cropIds = new Set(capture.regions.flatMap((region) => region.sourceIds));
  const sentStrokeArrays = condition === "C" || condition === "D";
  const targetRecords = input.nativeRecords.filter((record) => targetIds.has(record.id) && record.bounds);
  const bounds = targetRecords.flatMap((record) => record.bounds ? [record.bounds] : []);
  const world = bounds.length ? { x: Math.min(...bounds.map((b) => b.x)), y: Math.min(...bounds.map((b) => b.y)), width: Math.max(...bounds.map((b) => b.x + b.width)) - Math.min(...bounds.map((b) => b.x)), height: Math.max(...bounds.map((b) => b.y + b.height)) - Math.min(...bounds.map((b) => b.y)) } : null;
  const pixelBounds = world ? { x: capture.paddingPixels + (world.x - capture.worldBounds.x) * capture.camera.z, y: capture.paddingPixels + (world.y - capture.worldBounds.y) * capture.camera.z, width: world.width * capture.camera.z, height: world.height * capture.camera.z } : null;
  const targetStrokes = sourcePayload.strokes.filter((stroke) => targetIds.has(stroke.id));
  const sourceIdsIncluded = sentStrokeArrays ? new Set(sourcePayload.strokes.map((stroke) => stroke.id)) : new Set<string>();
  const targetCapturedByImage = condition === "A" ? [...targetIds].filter((id) => cropIds.has(id)) : [...targetIds];
  return {
    wholeSceneImageSubmitted: condition !== "A",
    imageMode: condition === "A" ? "selected-ocr-crops" : "full-scene-png",
    sceneBoundsCoveredInSubmittedImage: condition !== "A" ? capture.allSourceBoundsCovered : false,
    targetInkSourceIds: { total: targetIds.size, visibleInSubmittedImage: targetCapturedByImage.length, imageCoverage: ratio(targetCapturedByImage.length, targetIds.size), includedInCropSourceMap: condition === "A" ? targetCapturedByImage : [] },
    targetInkPixelBounds: pixelBounds,
    targetInkStrokeArrays: { supplied: sentStrokeArrays, count: sentStrokeArrays ? targetStrokes.length : 0, pointCount: sentStrokeArrays ? targetStrokes.reduce((sum, stroke) => sum + stroke.points.length / 3, 0) : 0, targetIdsIncluded: sentStrokeArrays ? targetStrokes.map((stroke) => stroke.id).sort() : [] },
    allFreehandStrokeArrays: { supplied: sentStrokeArrays, count: sentStrokeArrays ? sourcePayload.strokes.length : 0, pointCount: sentStrokeArrays ? sourcePayload.strokes.reduce((sum, stroke) => sum + stroke.points.length / 3, 0) : 0 },
    sourceObjectsSupplied: condition === "C" || condition === "D" ? sourcePayload.objects.length : 0,
    candidateGroupsSupplied: condition === "D" ? candidates.length : 0,
    baselineSelectedCropCount: condition === "A" ? capture.regions.length : 0,
    baselineStructuredRecordsAvailable: condition === "A" ? input.nativeRecords.length : 0,
  };
}

function reviewGoldGeometry(gold: SceneGold, input: CanvasInput, features: ReadonlyMap<string, { start?: { x: number; y: number }; end?: { x: number; y: number } }>) {
  const recordById = new Map(input.nativeRecords.map((record) => [record.id, record]));
  const boundsFor = (ids: readonly string[]) => {
    const bounds = ids.flatMap((id) => { const box = recordById.get(id)?.bounds; return box ? [box] : []; });
    if (!bounds.length) return null;
    const x = Math.min(...bounds.map((box) => box.x)), y = Math.min(...bounds.map((box) => box.y));
    return { x, y, width: Math.max(...bounds.map((box) => box.x + box.width)) - x, height: Math.max(...bounds.map((box) => box.y + box.height)) - y };
  };
  const gap = (point: { x: number; y: number }, bounds: { x: number; y: number; width: number; height: number }) => Math.hypot(Math.max(bounds.x - point.x, 0, point.x - bounds.x - bounds.width), Math.max(bounds.y - point.y, 0, point.y - bounds.y - bounds.height));
  return gold.relations.map((relation) => {
    const feature = relation.connectorId ? features.get(relation.connectorId) : undefined;
    const fromItem = gold.textItems.find((item) => item.id === relation.from), toItem = gold.textItems.find((item) => item.id === relation.to);
    const fromBounds = fromItem ? boundsFor(fromItem.sourceIds) : null, toBounds = toItem ? boundsFor(toItem.sourceIds) : null;
    if (!feature?.start || !feature.end || !fromBounds || !toBounds) return { id: relation.id, state: relation.state, connectorId: relation.connectorId ?? null, endpointGapsWorld: null, ambiguityReason: relation.ambiguityReason ?? null };
    const forward = [gap(feature.start, fromBounds), gap(feature.end, toBounds)], reverse = [gap(feature.end, fromBounds), gap(feature.start, toBounds)];
    const chosen = forward[0] + forward[1] <= reverse[0] + reverse[1] ? forward : reverse;
    return { id: relation.id, state: relation.state, connectorId: relation.connectorId ?? null, endpointGapsWorld: chosen, maximumEndpointGapWorld: Math.max(...chosen), ambiguityReason: relation.ambiguityReason ?? null };
  });
}

function summarizeRequestUsage(records: Array<Record<string, any>>) {
  const total = (items: Array<Record<string, any>>, field: string) => {
    const values = items.map((item) => item[field]).filter((value) => typeof value === "number");
    return { total: values.reduce((sum, value) => sum + value, 0), reportedRequests: values.length, missingRequests: items.length - values.length };
  };
  const conditionTotals = Object.fromEntries(["A", "B", "C", "D"].map((condition) => {
    const items = records.filter((record) => record.condition === condition);
    return [condition, { requests: items.length, promptTokens: total(items, "promptTokens"), completionTokens: total(items, "completionTokens"), totalTokens: total(items, "totalTokens"), latencyMs: items.reduce((sum, item) => sum + (item.latencyMs ?? 0), 0), imageBytes: items.reduce((sum, item) => sum + (item.imageBytes ?? 0), 0), stages: Object.fromEntries([...new Set(items.map((item) => item.stage))].map((stage) => [stage, items.filter((item) => item.stage === stage).length])) }];
  }));
  return { conditionTotals, promptTokens: total(records, "promptTokens"), completionTokens: total(records, "completionTokens"), totalTokens: total(records, "totalTokens"), latencyMs: records.reduce((sum, item) => sum + (item.latencyMs ?? 0), 0), usageProvidedByProvider: records.some((item) => typeof item.totalTokens === "number") };
}

function classifyConditionFailures(condition: Record<string, any>, grouping: Record<string, any>, gold: SceneGold) {
  const failures: Array<{ category: string; reason: string }> = [];
  const evaluation = condition.evaluation;
  if (condition.status === "failed") failures.push({ category: "provider-failure", reason: condition.error ?? condition.result?.error ?? "Inference pipeline failed." });
  if (condition.validationError) failures.push({ category: "unsupported-evidence", reason: condition.validationError });
  if (condition.rejectedReferences?.length) failures.push({ category: "unsupported-evidence", reason: `${condition.rejectedReferences.length} source reference(s) were rejected as unavailable in this condition.` });
  const coverage = condition.inputCoverage?.targetInkSourceIds;
  if (condition.condition === "A" && coverage && coverage.visibleInSubmittedImage < coverage.total) failures.push({ category: "capture", reason: `${coverage.total - coverage.visibleInSubmittedImage} target ink stroke(s) were outside the submitted OCR crops.` });
  if (condition.condition === "D" && (grouping.falseMergeCount > 0 || grouping.splitObjectCount > 0)) failures.push({ category: "segmentation", reason: `Candidate grouping has ${grouping.falseMergeCount} false merge(s) and ${grouping.splitObjectCount} split object(s); valid IDs do not establish correct grouping.` });
  if (evaluation) {
    if (evaluation.recognition.falseNegative || evaluation.recognition.falsePositive) failures.push({ category: "recognition", reason: `${evaluation.recognition.falseNegative} target label(s) missed and ${evaluation.recognition.falsePositive} out-of-scope/incorrect label claim(s).` });
    if (condition.condition !== "B" && (evaluation.spatialAssociation.mislocalized || evaluation.spatialAssociation.unlocalized || evaluation.spatialAssociation.unacknowledgedAmbiguity || evaluation.sourceStrokeGrounding.recall !== 1)) failures.push({ category: "source-grounding", reason: `Only ${evaluation.spatialAssociation.precise} label(s) have exact stroke localization; ${evaluation.spatialAssociation.ambiguous} are ambiguous, ${evaluation.spatialAssociation.mislocalized} mislocalized, and ${evaluation.spatialAssociation.unlocalized} unlocalized.` });
    if (evaluation.relations.clearFalseNegatives || evaluation.relations.falseAssociations || evaluation.relations.ambiguousMisses) failures.push({ category: "relationship-reconstruction", reason: `${evaluation.relations.clearFalseNegatives} clear relation(s) missed, ${evaluation.relations.falseAssociations} false association(s), and ${evaluation.relations.ambiguousMisses} ambiguous relation(s) not explicitly marked.` });
    if (evaluation.scientificInterpretation.formulaMentioned && (!evaluation.scientificInterpretation.formulaMatchesTarget || !evaluation.scientificInterpretation.formulaConditionallyQualified)) failures.push({ category: "scientific-interpretation", reason: "A formula claim was incorrect or failed to preserve the reviewed connectivity ambiguity." });
    if (evaluation.scientificInterpretation.formulaMentioned && (evaluation.scientificInterpretation.formulaSourceCoverage === null || evaluation.scientificInterpretation.formulaSourceCoverage < 1)) failures.push({ category: "unsupported-evidence", reason: "The formula claim did not cite all target source strokes used by the reviewed interpretation." });
  }
  if (condition.condition === "B" && !condition.rejectedReferences?.length) condition.measurementLimitations = ["Source-stroke grounding is unavailable by design in the image-only condition."];
  if (condition.condition === "A" && evaluation?.sourceStrokeGrounding.status === "region-only") condition.measurementLimitations = ["OCR source IDs identify the crop region, not the individual handwritten label within it."];
  return failures;
}

function renderMarkdownReport(report: Record<string, any>, gold: SceneGold, conditions: Array<Record<string, any>>, grouping: Record<string, any>) {
  const lines = [
    "# Whole-board scene-parser feasibility results",
    "",
    `- Board: ${report.board.id} · revision ${report.board.revision}`,
    `- Source hash: ${report.board.documentHash}`,
    `- Target: ${report.target.type}; ${report.target.sourceIds.length} original freehand source strokes`,
    `- Overall claim: feasibility case study only; no mixed-canvas readiness claim`,
    `- Groq requests: ${report.groq.requestsUsed}/${report.groq.requestBudget}`,
    `- Provider-reported tokens: ${report.groq.usage.totalTokens.total} total (${report.groq.usage.totalTokens.reportedRequests}/${report.groq.requestsUsed} responses reported usage)`,
    `- Source database unchanged: ${report.sourceImmutability.verified}`,
    `- Capture: ${report.capture.width}×${report.capture.height} PNG, ${report.capture.imageBytes} bytes, ${report.capture.pixelsPerWorldUnit} pixels/world unit; source bounds covered: ${report.capture.allSourceBoundsCovered}`,
    `- Ground truth review: ${report.target.groundTruthReview?.method ?? "not recorded"}; independent review complete: ${report.target.groundTruthReview?.independentReviewComplete ?? false}`,
    "",
    "## Conditions",
    "",
    "| Condition | Status | Runtime ms | Calls | Total tokens | Text P/R | Exact label localization | Bond P/R | Ambiguous edge acknowledged | Formula claim |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---|",
    ...conditions.map((condition) => {
      const metric = condition.evaluation, tokens = report.groq.usage.conditionTotals[condition.condition]?.totalTokens.total;
      return `| ${condition.condition} | ${condition.status} | ${Math.round(condition.runtimeMs ?? 0)} | ${report.groq.usage.conditionTotals[condition.condition]?.requests ?? 0} | ${tokens ?? 0} | ${formatMetric(metric?.recognition.precision)}/${formatMetric(metric?.recognition.recall)} | ${metric ? `${metric.spatialAssociation.precise}/${metric.recognition.goldCount}` : "N/A"} | ${formatMetric(metric?.relations.associationPrecision)}/${formatMetric(metric?.relations.associationRecall)} | ${metric ? `${metric.relations.ambiguousAcknowledged}/${metric.relations.ambiguousGoldCount}` : "N/A"} | ${metric?.scientificInterpretation.formulaMentioned ? metric.scientificInterpretation.formulaMatchesTarget ? metric.scientificInterpretation.formulaConditionallyQualified ? "conditional match" : "unqualified" : "incorrect" : "not claimed"} |`;
    }),
    "",
    "### Per-condition evaluation",
    "",
    ...conditions.flatMap((condition) => {
      const m = condition.evaluation, c = condition.inputCoverage;
      const failures = condition.failureClassifications?.length ? condition.failureClassifications.map((item: any) => `${item.category}: ${item.reason}`).join("; ") : "none classified";
      if (!m) return [`#### ${condition.condition}`, "", `- Status: ${condition.status}; runtime: ${Math.round(condition.runtimeMs ?? 0)} ms.`, `- Input coverage: ${c ? `${c.targetInkSourceIds.visibleInSubmittedImage}/${c.targetInkSourceIds.total} target ink strokes in image; ${c.targetInkStrokeArrays.count} target source strokes supplied as arrays; ${c.sourceObjectsSupplied} source objects; ${c.candidateGroupsSupplied} candidate groups.` : "not recorded"}`, `- Failure classification: ${failures}`, ""];
      return [
        `#### ${condition.condition}`,
        "",
        `- Input coverage: ${c.targetInkSourceIds.visibleInSubmittedImage}/${c.targetInkSourceIds.total} target ink strokes in image; ${c.targetInkStrokeArrays.count} target raw stroke arrays (${c.targetInkStrokeArrays.pointCount} points); ${c.sourceObjectsSupplied} source objects; ${c.candidateGroupsSupplied} candidate groups.`,
        `- Recognition: ${m.recognition.truePositive}/${m.recognition.goldCount} exact labels; ${m.recognition.falsePositive} extra claims; precision ${formatMetric(m.recognition.precision)}, recall ${formatMetric(m.recognition.recall)}.`,
        `- Source grounding: ${m.sourceStrokeGrounding.status}; precision ${formatMetric(m.sourceStrokeGrounding.precision)}, recall ${formatMetric(m.sourceStrokeGrounding.recall)}; exact label mappings ${m.spatialAssociation.precise}/${m.recognition.goldCount}; ambiguous ${m.spatialAssociation.ambiguous}, mislocalized ${m.spatialAssociation.mislocalized}, unlocalized ${m.spatialAssociation.unlocalized}.`,
        `- Relations: ${m.relations.clearTruePositives}/${m.relations.clearGoldCount} clear connections; false associations ${m.relations.falseAssociations}; ambiguous edge acknowledged ${m.relations.ambiguousAcknowledged}/${m.relations.ambiguousGoldCount}; relation stroke evidence precision/recall ${formatMetric(m.relations.relationEvidencePrecision)}/${formatMetric(m.relations.relationEvidenceRecall)}.`,
        `- Scientific interpretation: formula mentioned ${m.scientificInterpretation.formulaMentioned}; formula matches target ${m.scientificInterpretation.formulaMatchesTarget}; conditionally qualified ${m.scientificInterpretation.formulaConditionallyQualified}; full grounded graph ${m.scientificInterpretation.fullGroundedSceneUnderstanding}.`,
        `- Failure classification: ${failures}.`,
        ...(condition.measurementLimitations ?? []).map((item: string) => `- Measurement limit: ${item}`),
        "",
      ];
    }),
    "## Independent stroke-grouping evaluation",
    "",
    `- Gold freehand components: ${grouping.goldObjectCount}; deterministic candidates: ${grouping.candidateCount}.`,
    `- Candidate completeness recall: ${formatMetric(grouping.completeObjectRecall)}; mean candidate purity: ${formatMetric(grouping.meanCandidatePurity)}.`,
    `- False merges: ${grouping.falseMergeCount}; split objects: ${grouping.splitObjectCount}; exact source sets: ${grouping.exactGroupMatchCount}.`,
    `- ID resolution integrity: ${formatMetric(grouping.sourceIdResolutionPrecision)} (${grouping.validSourceReferenceCount}/${grouping.sourceReferenceCount}; ${grouping.invalidSourceReferenceCount} invalid). This is reference validity, not grouping or semantic correctness.`,
    "",
    "## Saved-geometry check",
    "",
    ...report.geometryReview.map((item: any) => `- ${item.id}: ${item.state}; connector ${item.connectorId}; endpoint gaps ${item.endpointGapsWorld ? item.endpointGapsWorld.map((value: number) => value.toFixed(1)).join(" and ") : "unavailable"} world units. ${item.ambiguityReason ?? ""}`),
    "- Distances describe geometry only; they do not confirm a chemical bond.",
    "",
    "## Crop selection",
    "",
    `- Existing OCR regions selected: ${report.cropSelection.selected.length}/3; target strokes captured: ${report.cropSelection.targetCapturedInkIds.length}/${report.target.sourceIds.length}; target strokes omitted: ${report.cropSelection.targetOmittedInkIds.length}.`,
    `- Omitted target IDs: ${report.cropSelection.targetOmittedInkIds.join(", ") || "none"}.`,
    "- Exact crop bounds, pixel transforms, and all omitted ink IDs are in capture.json; crop images are retained beside this report.",
    "",
    "## Provider usage",
    "",
    "| Condition | Stage | Model | Prompt tokens | Completion tokens | Total tokens | Image bytes | Latency ms | Status |",
    "|---|---|---|---:|---:|---:|---:|---:|---|",
    ...report.groq.records.map((request: Record<string, any>) => `| ${request.condition} | ${request.stage ?? "unknown"} | ${request.model ?? "unknown"} | ${request.promptTokens ?? "unreported"} | ${request.completionTokens ?? "unreported"} | ${request.totalTokens ?? "unreported"} | ${request.imageBytes ?? 0} | ${Math.round(request.latencyMs)} | ${request.status ?? request.error ?? "unknown"} |`),
    "",
    `- B→C token delta: ${tokenDelta(report.groq.usage.conditionTotals.B, report.groq.usage.conditionTotals.C)}; C→D token delta: ${tokenDelta(report.groq.usage.conditionTotals.C, report.groq.usage.conditionTotals.D)}.`,
    `- Exact dollar cost: unavailable; ${report.groq.exactCostReason}`,
    "- Raw OCR/provider responses, request settings, byte sizes, token usage, and errors are in provider-requests.json. Condition outputs are in condition-results.json.",
    "",
    "## Preservation and limits",
    "",
    `- Source document hash unchanged: ${report.sourceImmutability.documentHashBefore === report.sourceImmutability.documentHashAfter}.`,
    `- Revision unchanged: ${report.sourceImmutability.revisionBefore === report.sourceImmutability.revisionAfter}; updated_at unchanged: ${report.sourceImmutability.updatedAtBefore === report.sourceImmutability.updatedAtAfter}; source DB hash unchanged: ${report.sourceImmutability.databaseHashBefore === report.sourceImmutability.databaseHashAfter}.`,
    "- No UI edit, save, undo/redo operation, production Tutor call, or authoritative canvas mutation was invoked.",
    ...report.limitations.map((item: string) => `- Limitation: ${item}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function tokenDelta(a: Record<string, any>, b: Record<string, any>) {
  return typeof a?.totalTokens?.total === "number" && typeof b?.totalTokens?.total === "number" ? `${b.totalTokens.total - a.totalTokens.total} tokens` : "unavailable (provider did not report usage for both conditions)";
}

function formatMetric(value: unknown) { return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "N/A"; }
