import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { captureGateReason, captureScene, loadSavedSceneBoard, runFourConditions, saveCaptureArtifacts } from "../experiments/whole-board-scene/runner.js";

test.skip(process.env.STUDYAI_WHOLE_BOARD_SCENE_EXPERIMENT !== "1", "Set STUDYAI_WHOLE_BOARD_SCENE_EXPERIMENT=1 to run the isolated four-condition feasibility experiment.");

test("run the isolated saved-board whole-scene feasibility experiment", async ({ page }) => {
  test.setTimeout(600_000);
  const sourcePath = process.env.STUDYAI_WHOLE_BOARD_DB;
  const runId = process.env.STUDYAI_WHOLE_BOARD_RUN_ID;
  expect(sourcePath, "STUDYAI_WHOLE_BOARD_DB must point at the preserved SQLite database").toBeTruthy();
  expect(runId, "STUDYAI_WHOLE_BOARD_RUN_ID must uniquely identify these artifacts").toMatch(/^[A-Za-z0-9_-]{1,80}$/);
  const runDirectory = resolve(".experiment-artifacts", "whole-board-scene", "runs", runId!);
  const board = loadSavedSceneBoard(sourcePath!);
  const capture = await captureScene(page, board.input, board.document);
  const metadata = saveCaptureArtifacts(runDirectory, board, capture);
  const gateReason = captureGateReason(metadata);

  if (gateReason) {
    writeFileSync(join(runDirectory, "capture-only.txt"), `${gateReason}\n`);
    console.log(JSON.stringify({ status: "capture-only", gateReason, capture: metadata }));
    test.skip(true, gateReason);
    return;
  }

  expect(process.env.GROQ_API_KEY?.trim()).toBeTruthy();
  const report = await runFourConditions({ board, capture, runDirectory });
  expect(report.sourceImmutability.verified).toBe(true);
  expect(report.groq.requestsUsed).toBeLessThanOrEqual(8);
  expect(report.conditions.map((condition) => condition.condition as string)).toEqual(["A", "B", "C", "D"]);
  expect(existsSync(join(runDirectory, "report.json"))).toBe(true);
  console.log(JSON.stringify({ status: "completed", runDirectory, requestsUsed: report.groq.requestsUsed, sourceImmutable: report.sourceImmutability.verified }));
});
