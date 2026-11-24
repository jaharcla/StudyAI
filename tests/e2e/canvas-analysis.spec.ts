import { expect, test } from "@playwright/test";
import { buildCanvasEvidence, selectCanvasContext } from "../../server/canvas-intelligence/evidence.js";
import { geometryObservations, normalizeCanvasInput } from "../../server/canvas-intelligence/input.js";
import { associateOCRLabels } from "../../server/canvas-intelligence/regions.js";
import { FusionResultSchema, OCRResultSchema, StructureResultSchema } from "../../server/canvas-intelligence/types.js";
import { createCanvasAnalysisResult } from "../../server/canvas-analysis/contract.js";
import { createCourseWithLesson, drawCarbonDioxide, selectCourseOnPage } from "./helpers";
import { drawForce, drawHandwrittenF5N, setForceUnits, useMockGroqCanvasAnalysis } from "./canvas-grounding-helpers";

test("Canvas analysis is sent only after an explicit user action", async ({ page }) => {
  const { course, lesson } = await createCourseWithLesson(page.request);
  const submitted: Array<{ url: string; payload: Record<string, any> }> = [];
  await page.route(/\/api\/canvases\/[^/]+\/analysis\?/, async (route) => {
    // Loading a stored analysis is a GET; only POSTs are user submissions.
    if (route.request().method() !== "POST") { await route.continue(); return; }
    const url = new URL(route.request().url());
    const boardId = url.pathname.split("/").at(-2)!;
    const payload = route.request().postDataJSON() as Record<string, any>;
    submitted.push({ url: url.toString(), payload });
    const fetchRow = () => page.request.get(`/api/canvases/${encodeURIComponent(boardId)}?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`).then((response) => response.json()) as Promise<{ id: string; course_id: string; lesson_id: string; revision: number; document: string }>;
    let row = await fetchRow();
    for (let attempt = 0; attempt < 10 && typeof row?.document !== "string"; attempt++) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      row = await fetchRow();
    }
    if (typeof row?.document !== "string") throw new Error(`board ${boardId} was not persisted before analysis (row: ${JSON.stringify(row).slice(0, 120)})`);
    const savedDocument = JSON.parse(row.document);
    const canvasInput = normalizeCanvasInput({ boardId: row.id, courseId: row.course_id, lessonId: row.lesson_id, snapshot: savedDocument.snapshot, scientificObjects: savedDocument.objects, selectedIds: payload.selectedIds, image: payload.image });
    const ocr = OCRResultSchema.parse({ items: [], uncertain: false, raw: "" });
    const structure = StructureResultSchema.parse({ objects: [], relationships: [], observations: geometryObservations(canvasInput), ambiguities: [] });
    const evidence = buildCanvasEvidence(canvasInput, ocr, structure, associateOCRLabels(canvasInput, ocr));
    const selectedContext = selectCanvasContext(evidence, { question: "Analyze this board.", selectedIds: payload.selectedIds, expectedRevisionHash: canvasInput.revision, maxChars: 100_000, nativeRecords: canvasInput.nativeRecords, scientificObjects: canvasInput.scientificObjects });
    const provenance = [
      { id: "prov-canvas", stage: "canvas", provider: "quickdraw", method: "Persisted Quickdraw snapshot and scientific objects", model: null, createdAt: "2026-11-08T17:00:00.000Z" },
      { id: "prov-geometry", stage: "geometry", provider: "system", method: "Deterministic geometry", model: null, createdAt: "2026-11-08T17:00:00.000Z" },
      { id: "prov-ocr", stage: "ocr", provider: "system", method: "Model-free UI test", model: null, createdAt: "2026-11-08T17:00:00.000Z" },
      { id: "prov-structure", stage: "structure", provider: "system", method: "Model-free UI test", model: null, createdAt: "2026-11-08T17:00:00.000Z" },
      { id: "prov-fusion", stage: "fusion", provider: "system", method: "Model-free UI test", model: null, createdAt: "2026-11-08T17:00:00.000Z" },
    ];
    const fusion = FusionResultSchema.parse({ answer: "", objects: [], relationships: [], associations: [], uncertainties: [] });
    const analysis = createCanvasAnalysisResult({
      board: { boardId: row.id, courseId: row.course_id, lessonId: row.lesson_id, revision: row.revision, document: row.document },
      canvasInput,
      evidence,
      selectedContext,
      pipelineResult: { schemaVersion: 1, fixtureId: `canvas-${row.id}`, pipelineId: "P1", pipelineVersion: "canvas-intelligence-contract-adapter/1", status: "partial", objects: [], relationships: [], interpretations: [], provenance, uncertainties: ["No model was called in this UI test."], errors: [] },
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ analysis }) });
  });

  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await page.getByRole("button", { name: "Draw — D" }).click();
  const board = (await page.locator(".canvas-board").boundingBox())!;
  await page.mouse.move(board.x + 250, board.y + 80);
  await page.mouse.down();
  await page.mouse.move(board.x + 350, board.y + 130, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".saved")).toHaveText("All changes saved", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Analyze board" })).toBeEnabled();
  expect(submitted).toHaveLength(0);

  const response = page.waitForResponse((item) => item.request().method() === "POST" && item.url().includes("/analysis?"));
  await page.getByRole("button", { name: "Analyze board" }).click();
  await response;
  await expect(page.getByRole("button", { name: "Analyze board" })).toBeEnabled();
  expect(submitted).toHaveLength(1);
  expect(submitted[0].payload).toMatchObject({ expectedRevision: expect.any(Number), image: { regions: [expect.objectContaining({ mimeType: "image/png", base64: expect.any(String), sourceIds: expect.any(Array), pixelToWorld: expect.any(Object) })] } });
  expect(submitted[0].payload.image.regions[0].base64.length).toBeGreaterThan(10);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("handwritten F = 5 N keeps source evidence and a unique force candidate through Analyze Board", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(request, `Grounded force ${Date.now()}`, "Force label");
  await page.goto("/"); await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  const capture = await useMockGroqCanvasAnalysis(page, course.id, lesson.id);
  const box = (await page.locator(".canvas-board").boundingBox())!;
  await drawForce(page, { x: box.x + 500, y: box.y + 340 }, { x: box.x + 600, y: box.y + 340 });
  await setForceUnits(page);
  await page.getByRole("button", { name: "Draw — D", exact: true }).click();
  await drawHandwrittenF5N(page, box.x + 398, box.y + 322);
  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved", { timeout: 15_000 });

  const read = async () => {
    const boards = await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
    const row = await request.get(`/api/canvases/${boards[0].id}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
    return { ...row, document: JSON.parse(row.document) };
  };
  const before = await read();
  const beforeDocument = structuredClone(before.document);
  const force = before.document.objects.find((object: { kind: string }) => object.kind === "force");
  expect(force).toBeDefined();
  expect(force.units).toBe("N");
  expect(Math.hypot(...force.components)).toBeCloseTo(5, 5);
  const ink = Object.values(before.document.snapshot.document.store).filter((shape: any) => shape.type === "draw");
  expect(ink.length).toBeGreaterThan(5);

  const analysisResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/analysis"));
  await page.getByRole("button", { name: "Analyze board" }).click();
  const response = await analysisResponse;
  expect(response.status()).toBe(200);
  const { analysis } = await response.json();
  const recognized = analysis.observedEvidence.items.find((item: any) => item.origin === "ocr" && item.text === "F = 5 N");
  const association = analysis.observedEvidence.items.find((item: any) => item.kind === "association" && item.origin === "geometry");
  expect(capture.ocrCalls).toBeGreaterThan(0);
  expect(capture.crops).toHaveLength(1);
  expect(recognized).toMatchObject({ confidence: null, locationPrecision: "region", uncertain: true, sourceIds: capture.crops[0].sourceIds, sourceRegionId: capture.crops[0].id, worldRegion: capture.crops[0].worldBounds });
  expect(recognized.sourceIds.every((id: string) => ink.some((shape: any) => shape.id === id))).toBe(true);
  expect(association.association).toMatchObject({ status: "geometry-supported", verificationStatus: "unconfirmed", candidateRefs: [{ scope: "science", id: force.id }] });
  expect(association.uncertain).toBe(true);
  expect(analysis.observedEvidence.selectedContext.evidence.some((item: any) => item.association?.candidateRefs.some((ref: any) => ref.id === force.id))).toBe(true);
  expect(recognized).not.toHaveProperty("imageRegion");
  expect(recognized.sourceRegion).toMatchObject({ id: capture.crops[0].id, worldBounds: capture.crops[0].worldBounds, cropBounds: capture.crops[0].cropBounds, sourceIds: capture.crops[0].sourceIds, pixelWidth: capture.crops[0].pixelWidth, pixelHeight: capture.crops[0].pixelHeight, pixelToWorld: capture.crops[0].pixelToWorld });
  expect(recognized.sourceIds).not.toContain("made-up-stroke");
  expect((await read()).document).toEqual(beforeDocument);

  await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
  await expect.poll(async () => Object.values((await read()).document.snapshot.document.store).filter((shape: any) => shape.type === "draw").length).toBe(ink.length - 1);
  expect((await read()).document.objects).toEqual(beforeDocument.objects);
  await page.getByRole("button", { name: "Redo canvas change", exact: true }).click();
  await expect.poll(async () => (await read()).document.snapshot.document.store).toEqual(beforeDocument.snapshot.document.store);
  await page.reload();
  await expect(page.getByRole("button", { name: "Analyze board" })).toBeEnabled();
  expect((await read()).document).toEqual(beforeDocument);
});

test("handwritten F = 5 N stays ambiguous between two equally close force arrows", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(request, `Ambiguous force labels ${Date.now()}`, "Force labels");
  await page.goto("/"); await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  const capture = await useMockGroqCanvasAnalysis(page, course.id, lesson.id);
  const box = (await page.locator(".canvas-board").boundingBox())!;
  await drawForce(page, { x: box.x + 500, y: box.y + 300 }, { x: box.x + 600, y: box.y + 300 });
  await drawForce(page, { x: box.x + 500, y: box.y + 350 }, { x: box.x + 600, y: box.y + 350 });
  await page.getByRole("button", { name: "Draw — D", exact: true }).click();
  await drawHandwrittenF5N(page, box.x + 398, box.y + 314);
  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved", { timeout: 15_000 });
  const boards = await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const row = await request.get(`/api/canvases/${boards[0].id}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const before = JSON.parse(row.document);
  const forceIds = before.objects.filter((object: { kind: string }) => object.kind === "force").map((object: { id: string }) => object.id).sort();
  expect(forceIds).toHaveLength(2);

  const analysisResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/analysis"));
  await page.getByRole("button", { name: "Analyze board" }).click();
  const response = await analysisResponse;
  expect(response.status()).toBe(200);
  const { analysis } = await response.json();
  const association = analysis.observedEvidence.items.find((item: any) => item.kind === "association" && item.origin === "geometry");
  expect(capture.crops).toHaveLength(1);
  expect(association.association).toMatchObject({ status: "ambiguous", verificationStatus: "unconfirmed" });
  expect(association.association.candidateRefs.map((ref: { id: string }) => ref.id).sort()).toEqual(forceIds);
  expect(analysis.observedEvidence.items.find((item: any) => item.origin === "ocr")).toMatchObject({ subjectId: null, claimValue: null, confidence: null, locationPrecision: "region", uncertain: true });
  expect((await request.get(`/api/canvases/${boards[0].id}?course=${course.id}&lesson=${lesson.id}`).then((result) => result.json()).then((saved) => JSON.parse(saved.document))).objects).toEqual(before.objects);
});

test("a stale canvas save keeps the uncommitted edit visible and sends its expected revision", async ({ page }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(page.request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  let attempted: Record<string, any> | undefined;
  await page.route("**/api/canvases", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const payload = route.request().postDataJSON() as Record<string, any>;
    if (payload.expectedRevision === 0) return route.continue();
    attempted = payload;
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Canvas revision conflict" }) });
  });
  await drawCarbonDioxide(page);
  await expect(page.locator(".saved")).toHaveText("Canvas changed elsewhere. Reload the board before saving.", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Carbon dioxide" })).toBeVisible();
  expect(attempted?.expectedRevision).toEqual(expect.any(Number));
  const rows = await page.request.get(`/api/canvases?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`).then((response) => response.json());
  const saved = await page.request.get(`/api/canvases/${encodeURIComponent(rows[0].id)}?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`).then((response) => response.json());
  expect(JSON.parse(saved.document).objects).toHaveLength(0);
});
