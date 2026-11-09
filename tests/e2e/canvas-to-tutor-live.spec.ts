import { expect, test } from "@playwright/test";
import { createCourseWithLesson, drawCarbonDioxide, selectCourseOnPage } from "./helpers";

test.skip(process.env.STUDYAI_LIVE_GROQ_E2E !== "1", "Run only for the approved synthetic live Groq validation.");

test("live Groq validates synthetic Canvas OCR, analysis, Tutor uncertainty, and stale revision guards", async ({ page, request }) => {
  test.setTimeout(240_000);
  expect(process.env.GROQ_API_KEY?.trim()).toBeTruthy();

  const { course, lesson } = await createCourseWithLesson(request, `SYNTHETIC GROQ VALIDATION ${Date.now()}`, "Synthetic Lewis structure");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await drawCarbonDioxide(page, false);
  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved", { timeout: 15_000 });

  const boards = await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const savedBoards = await Promise.all(boards.map(async (item: { id: string }) => {
    const board = await request.get(`/api/canvases/${item.id}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
    return { board, document: JSON.parse(board.document) };
  }));
  const saved = savedBoards.find((item) => item.document.objects.some((object: { kind?: string }) => object.kind === "molecule"));
  expect(saved).toBeDefined();
  const { board, document } = saved!;
  const molecule = document.objects.find((item: { kind?: string }) => item.kind === "molecule");
  expect(molecule?.name).toBe("Carbon dioxide");
  expect(molecule.atoms.map((item: { element: string }) => item.element).sort()).toEqual(["C", "O", "O"]);
  expect(molecule.resonanceForms[0].bonds.map((item: { order: number }) => item.order)).toEqual([2, 2]);

  const textShapeId = `shape:synthetic-ocr-${Date.now()}`;
  document.snapshot.document.store[textShapeId] = { id: textShapeId, typeName: "shape", type: "text", x: 40, y: 40, rot: 0, z: 1, props: { text: "SYNTHETIC OCR 417 CO2", color: "black", size: "m", font: "draw", autosize: true, scale: 1 } };
  const seeded = await request.post("/api/canvases", { data: { id: board.id, courseId: course.id, lessonId: lesson.id, name: board.name, document, expectedRevision: board.revision } });
  expect(seeded.status()).toBe(200);
  await page.reload();
  const authoritative = await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  await expect(page.getByRole("button", { name: "Analyze board" })).toBeEnabled();

  const analysisResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/analysis"), { timeout: 120_000 });
  await page.getByRole("button", { name: "Analyze board" }).click();
  const analysisResponse = await analysisResponsePromise;
  const analysisBody = await analysisResponse.text();
  expect(analysisResponse.status(), analysisBody).toBe(200);
  const { analysis } = JSON.parse(analysisBody);

  expect(analysis).toMatchObject({ boardId: board.id, courseId: course.id, lessonId: lesson.id, analysisStatus: "complete" });
  expect(analysis.observedEvidence.sourceScope).toMatchObject({ boardId: board.id, courseId: course.id, lessonId: lesson.id });
  expect(analysis.revision).toBe(authoritative.revision + 1);
  const analysisBoard = await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  expect(analysisBoard.revision).toBe(analysis.revision);
  expect(analysis.revisionHash).toMatch(/^[a-f0-9]{64}$/);
  const captureRevisionHash = analysis.observedEvidence.sourceScope.revisionHash;
  expect(captureRevisionHash).toMatch(/^[a-f0-9]{64}$/);
  expect(analysis.observedEvidence.selectedContext.scope).toMatchObject({ boardId: board.id, courseId: course.id, lessonId: lesson.id, revisionHash: captureRevisionHash });
  expect(analysis.diagnostics.timings.stages.ocr).toBeGreaterThan(0);
  expect(analysis.diagnostics.timings.stages.structure).toBeGreaterThan(0);
  expect(analysis.diagnostics.timings.stages.fusion).toBeGreaterThan(0);
  expect(analysis.observedEvidence.items.some((item: { origin: string; sourceIds: string[] }) => item.origin === "native" && item.sourceIds.includes(molecule.id))).toBe(true);
  expect(analysis.observedEvidence.items.some((item: { origin: string; text: string }) => item.origin === "ocr" && /\b417\b/.test(item.text))).toBe(true);
  expect(analysis.observedEvidence.items.some((item: { origin: string; text: string }) => item.origin === "ocr" && /\bCO2\b/i.test(item.text))).toBe(true);
  expect(analysis.inferredInterpretations.items.length).toBeGreaterThan(0);
  expect(analysis.inferredInterpretations.items.every((item: { verificationStatus: string; uncertainty: string[] }) => item.verificationStatus === "unverified" && item.uncertainty.length > 0)).toBe(true);
  expect(analysis.inferredInterpretations.evidence.every((item: { origin: string; uncertain: boolean }) => item.origin === "model" && item.uncertain)).toBe(true);

  const validAnalysis = await request.post(`/api/canvases/${board.id}/analysis/validate?course=${course.id}&lesson=${lesson.id}`, { data: analysis });
  expect(validAnalysis.status()).toBe(200);
  for (const scope of [{ boardId: `${board.id}-wrong` }, { courseId: `${course.id}-wrong` }, { lessonId: `${lesson.id}-wrong` }]) {
    const mismatchedAnalysis = structuredClone(analysis);
    Object.assign(mismatchedAnalysis, scope);
    Object.assign(mismatchedAnalysis.observedEvidence.sourceScope, scope);
    Object.assign(mismatchedAnalysis.observedEvidence.selectedContext.scope, scope);
    const mismatched = await request.post(`/api/canvases/${board.id}/analysis/validate?course=${course.id}&lesson=${lesson.id}`, { data: mismatchedAnalysis });
    expect(mismatched.status()).toBe(409);
    expect(await mismatched.json()).toMatchObject({ code: "scope_mismatch" });
  }

  const chat = page.getByTestId("copilot-chat-textarea");
  await chat.fill("Using the latest supplied canvas analysis, state the molecule and its bond pattern. Separate what the canvas directly encodes from AI interpretation, preserve uncertainty, and do not edit the board.");
  await chat.press("Enter");
  const tutor = page.locator(".copilot-slot");
  await expect(tutor).toContainText(/carbon dioxide|CO2|CO₂/i, { timeout: 180_000 });
  await expect(tutor).toContainText(/double bond/i);
  await expect(tutor).toContainText(/observed|encoded|canvas/i);
  await expect(tutor).toContainText(/unverified|not verified|uncertain|interpretation|inferred/i);

  const revision = analysis.revision;
  const latestDocument = JSON.parse(analysisBoard.document);
  const renamed = await request.post("/api/canvases", { data: { id: board.id, courseId: course.id, lessonId: lesson.id, name: "Synthetic revision check", document: latestDocument, expectedRevision: revision } });
  expect(renamed.status()).toBe(200);
  await chat.fill("Use the previous canvas analysis to answer: what molecule and bond pattern does it show?");
  await chat.press("Enter");
  await expect(tutor).toContainText(/Canvas analysis was rejected as invalid, stale, or out of scope/i, { timeout: 30_000 });
  const staleSave = await request.post("/api/canvases", { data: { id: board.id, courseId: course.id, lessonId: lesson.id, name: "Rejected stale write", document: latestDocument, expectedRevision: revision } });
  expect(staleSave.status()).toBe(409);
  const staleAnalysis = await request.post(`/api/canvases/${board.id}/analysis/validate?course=${course.id}&lesson=${lesson.id}`, { data: analysis });
  expect(staleAnalysis.status()).toBe(409);
  expect(await staleAnalysis.json()).toMatchObject({ code: "stale_revision" });
  const current = await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  expect(current.revision).toBe(revision + 1);
  expect(current.name).toBe("Synthetic revision check");
});
