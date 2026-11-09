import { expect, test } from "@playwright/test";
import { buildCanvasEvidence, selectCanvasContext } from "../../server/canvas-intelligence/evidence.js";
import { geometryObservations, normalizeCanvasInput } from "../../server/canvas-intelligence/input.js";
import { associateOCRLabels } from "../../server/canvas-intelligence/regions.js";
import { FusionResultSchema, OCRResultSchema, StructureResultSchema } from "../../server/canvas-intelligence/types.js";
import { createCanvasAnalysisResult } from "../../server/canvas-analysis/contract.js";
import { createCourseWithLesson, drawCarbonDioxide, selectCourseOnPage } from "./helpers";

test("Canvas analysis is sent only after an explicit user action", async ({ page }) => {
  const { course, lesson } = await createCourseWithLesson(page.request);
  const submitted: Array<{ url: string; payload: Record<string, any> }> = [];
  await page.route(/\/api\/canvases\/[^/]+\/analysis\?/, async (route) => {
    const url = new URL(route.request().url());
    const boardId = url.pathname.split("/").at(-2)!;
    const payload = route.request().postDataJSON() as Record<string, any>;
    submitted.push({ url: url.toString(), payload });
    const boardResponse = await page.request.get(`/api/canvases/${encodeURIComponent(boardId)}?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`);
    const row = await boardResponse.json() as { id: string; course_id: string; lesson_id: string; revision: number; document: string };
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
  expect(submitted[0].payload).toMatchObject({ expectedRevision: expect.any(Number), image: { mimeType: "image/png", base64: expect.any(String) } });
  expect(submitted[0].payload.image.base64.length).toBeGreaterThan(10);
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
