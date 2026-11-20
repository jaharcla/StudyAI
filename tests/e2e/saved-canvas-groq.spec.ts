import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { stableJson } from "../../src/canvas/stable-json.js";
import { selectCourseOnPage } from "./helpers.js";

const boardId = process.env.STUDYAI_BENCHMARK_BOARD_ID;
const courseId = process.env.STUDYAI_BENCHMARK_COURSE_ID;
const lessonId = process.env.STUDYAI_BENCHMARK_LESSON_ID;
const expectedHandwritingSourceIds = (JSON.parse(readFileSync(new URL("../fixtures/canvas-grounding/preserved-quickdraw-sample.json", import.meta.url), "utf8")) as { expectedHandwritingSourceIds: string[] }).expectedHandwritingSourceIds;

test.skip(process.env.STUDYAI_SAVED_CANVAS_GROQ_E2E !== "1" || !boardId || !courseId || !lessonId, "Set STUDYAI_SAVED_CANVAS_GROQ_E2E=1 and the saved board scope to run the real-canvas Groq benchmark.");

test("live Groq evaluates handwriting in the preserved saved canvas", async ({ page, request }) => {
  test.setTimeout(240_000);
  expect(process.env.GROQ_API_KEY?.trim()).toBeTruthy();
  const readBoard = async () => {
    const response = await request.get(`/api/canvases/${encodeURIComponent(boardId!)}?course=${encodeURIComponent(courseId!)}&lesson=${encodeURIComponent(lessonId!)}`);
    expect(response.status()).toBe(200);
    return await response.json() as { id: string; course_id: string; lesson_id: string; revision: number; name: string; document: string };
  };
  const before = await readBoard();
  const beforeDocument = JSON.parse(before.document);
  const beforeJson = stableJson(beforeDocument);
  const courses = await request.get("/api/courses").then((response) => response.json()) as Array<{ id: string; title: string }>;
  const course = courses.find((item) => item.id === courseId);
  expect(course).toBeDefined();

  await page.goto("/");
  await selectCourseOnPage(page, course!.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toHaveText(before.name);
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/analysis"), { timeout: 180_000 });
  await page.getByRole("button", { name: "Analyze board" }).click();
  const response = await responsePromise;
  const responseText = await response.text();
  expect(response.status(), responseText).toBe(200);
  const { analysis } = JSON.parse(responseText) as { analysis: Record<string, any> };
  const payload = response.request().postDataJSON() as { image?: { regions?: Array<{ id: string; sourceIds: string[]; worldBounds: unknown; cropBounds: unknown; base64: string }> } };
  const regions = payload.image?.regions ?? [];
  const handwritingRegion = regions.find((region) => expectedHandwritingSourceIds.every((id) => region.sourceIds.includes(id)));
  expect(handwritingRegion, "the real H-C-H ink must be included in an analyzed image crop").toBeDefined();

  const OCRItems = (analysis.observedEvidence.items as Array<Record<string, any>>).filter((item) => item.origin === "ocr");
  const handwritingItems = OCRItems.filter((item) => item.sourceRegionId === handwritingRegion!.id);
  for (const item of handwritingItems) {
    expect(item.confidence).toBeNull();
    expect(item.sourceIds).toEqual(handwritingRegion!.sourceIds);
    expect(item.sourceRegion).toMatchObject({ id: handwritingRegion!.id, sourceIds: handwritingRegion!.sourceIds, worldBounds: handwritingRegion!.worldBounds });
    expect(item.worldRegion).toEqual(handwritingRegion!.worldBounds);
    expect(item).not.toHaveProperty("imageRegion");
  }

  const outputDirectory = process.env.STUDYAI_BENCHMARK_OUTPUT_DIR;
  if (outputDirectory) {
    mkdirSync(outputDirectory, { recursive: true });
    for (const [index, region] of regions.entries()) writeFileSync(join(outputDirectory, `saved-board-crop-${index + 1}.png`), Buffer.from(region.base64, "base64"));
    writeFileSync(join(outputDirectory, "saved-board-analysis-response.json"), `${JSON.stringify({ analysis, regions: regions.map(({ base64: _base64, ...region }) => region) }, null, 2)}\n`);
    writeFileSync(join(outputDirectory, "saved-board-benchmark-summary.json"), `${JSON.stringify({ boardId, revisionBefore: before.revision, revisionAfter: (await readBoard()).revision, selectedRegions: regions.map(({ base64: _base64, ...region }) => region), omittedRegions: analysis.omittedRegions, handwritingOcrItems: handwritingItems.map(({ sourceIds: _sourceIds, sourceRegion: _sourceRegion, ...item }) => item), transcription: handwritingItems.map((item) => item.text).join(" "), latencyMs: analysis.diagnostics.timings, analysisStatus: analysis.analysisStatus }, null, 2)}\n`);
  }

  const after = await readBoard();
  expect(analysis.revision).toBe(before.revision);
  expect(after.revision).toBe(before.revision);
  expect(stableJson(JSON.parse(after.document))).toBe(beforeJson);
  console.log(JSON.stringify({ boardId, revision: before.revision, selectedRegions: regions.map(({ base64: _base64, ...region }) => region), omittedRegions: analysis.omittedRegions, handwritingRecognition: handwritingItems.map((item) => item.text), analysisStatus: analysis.analysisStatus, latencyMs: analysis.diagnostics.timings }));
});
