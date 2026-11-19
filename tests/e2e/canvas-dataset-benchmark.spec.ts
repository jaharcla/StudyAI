import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { selectCourseOnPage } from "./helpers";

const boards = [
  { id: "mathwriting-003ca9082c7047d3", name: "MathWriting · partial derivative fraction" },
  { id: "mathwriting-009d124a50399bba", name: "MathWriting · indexed sum" },
  { id: "mathwriting-010d0f9e951a7a44", name: "MathWriting · nested logistic expression" },
  { id: "mathwriting-02c9daf282f5a1e3", name: "MathWriting · bra-ket sum" },
  { id: "mathwriting-01e6c79f4d27bc54", name: "MathWriting · exponential decay" },
  { id: "mathwriting-001083e26028da36", name: "MathWriting · gradient vector" },
  { id: "physalign-spring-graph", name: "PhysAlign · spring and force-length graph" },
];

test("analyzes the dataset canvases through CanvasStudio and the live pipeline", async ({ page }) => {
  test.setTimeout(900_000);
  const outputDir = resolve("data/canvas-dataset-benchmark/runs");
  const outputPath = resolve(outputDir, "latest.json");
  const results: Array<Record<string, unknown>> = [];
  mkdirSync(outputDir, { recursive: true });

  await page.goto("/");
  await selectCourseOnPage(page, "Dataset Canvas Benchmark");

  for (const board of boards) {
    const menu = page.locator(".canvas-board-menu");
    if (!await menu.isVisible()) await page.getByRole("button", { name: "Choose canvas board" }).click();
    await menu.getByRole("button", { name: board.name, exact: true }).click();
    await expect(page.locator(".canvas-board-button")).toContainText(board.name, { timeout: 20_000 });
    const analyze = page.getByRole("button", { name: "Analyze board" });
    await expect(analyze).toBeEnabled({ timeout: 30_000 });
    const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/analysis"), { timeout: 240_000 });
    await analyze.click();
    const response = await responsePromise;
    const payload = response.request().postDataJSON() as { image?: { regions?: Array<{ id: string; sourceIds: string[]; pixelWidth: number; pixelHeight: number }> } };
    const body = await response.json() as { analysis?: { analysisStatus: string; diagnostics: { timings?: { totalMs?: number; stages?: Record<string, number> } }; observedEvidence: { items: Array<{ origin: string; kind: string; text?: string; sourceIds: string[] }> }; inferredInterpretations: { items: Array<{ statement: string }> }; omittedRegions: Array<{ id: string; reason: string }> }; error?: string };
    results.push({
      boardId: board.id,
      boardName: board.name,
      httpStatus: response.status(),
      apiCalls: 1,
      capturedRegions: payload.image?.regions?.map(({ id, sourceIds, pixelWidth, pixelHeight }) => ({ id, sourceIds, pixelWidth, pixelHeight })) ?? [],
      analysisStatus: body.analysis?.analysisStatus ?? null,
      timings: body.analysis?.diagnostics.timings ?? null,
      evidenceCounts: body.analysis?.observedEvidence.items.reduce<Record<string, number>>((counts, item) => { counts[item.origin] = (counts[item.origin] ?? 0) + 1; return counts; }, {}) ?? {},
      ocrText: body.analysis?.observedEvidence.items.filter((item) => item.origin === "ocr").map((item) => ({ text: item.text ?? "", sourceIds: item.sourceIds })) ?? [],
      interpretations: body.analysis?.inferredInterpretations.items.map((item) => item.statement) ?? [],
      omittedRegions: body.analysis?.omittedRegions ?? [],
      error: body.error ?? null,
    });
    writeFileSync(outputPath, JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2));
    await expect(analyze).toBeEnabled({ timeout: 30_000 });
  }

  expect(results).toHaveLength(boards.length);
});
