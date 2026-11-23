import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

type TestWindow = Window & { __studyaiAuthorBoard?: (input: unknown) => Promise<unknown> };
type SavedBoard = { revision: number; document: string };

const mockedTurn = (boardId: string) => ({
  boardId,
  topic: "friction from module 1",
  artifact: {
    kind: "question",
    count: 1,
    prompt: "Draw the three forces on the block and name them.",
    answer: "Friction opposes the motion down the slope.",
    citationLabel: "Module 1 · p. 4",
    concepts: ["friction", "free-body diagram"],
    figure: {
      kind: "freebody",
      title: "Forces on the block",
      forces: [
        { label: "gravity", components: [0, -9.8] },
        { label: "normal", components: [3, 5] },
        { label: "friction", components: [-4, 0] },
      ],
    },
  },
  placement: { relation: "clear-area" },
  sourceRefs: ["studyai://document/module-1/text/4?chunk=0"],
  reason: "The student asked for a friction question with a diagram.",
});

test.setTimeout(120_000);

test("one friction authoring turn: one review, one revision, cited and labelled generated", async ({ page }) => {
  const { course, lesson } = await createCourseWithLesson(page.request, `Author board ${Date.now()}`, "Friction lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();

  const url = `/api/canvases?course=${course.id}&lesson=${lesson.id}`;
  await expect.poll(async () => (await page.request.get(url)).ok()).toBe(true);
  const boards = await (await page.request.get(url)).json() as Array<{ id: string }>;
  const boardId = boards[0].id;
  const boardUrl = `/api/canvases/${boardId}?course=${course.id}&lesson=${lesson.id}`;
  const readSaved = async (): Promise<SavedBoard> => (await (await page.request.get(boardUrl)).json()) as SavedBoard;
  const before = await readSaved();

  const sendTurn = async () => {
    await page.waitForFunction(() => typeof (window as TestWindow).__studyaiAuthorBoard === "function", null, { timeout: 30_000 });
    const result = await page.evaluate(async (payload) => (window as TestWindow).__studyaiAuthorBoard!(payload), mockedTurn(boardId));
    expect(result).toMatchObject({ status: "pending_user_review" });
  };

  await sendTurn();
  const dialog = page.getByTestId("board-artifact-proposal");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Module 1 · p. 4");
  await expect(dialog).toContainText("gravity");
  await expect(dialog).toContainText("normal");
  await expect(dialog).toContainText("friction");
  await expect(dialog.getByTestId("generated-unverified")).toHaveText(/generated, not verified/i);
  await expect(dialog.locator("a[href*='studyai-citation']")).toHaveCount(1);
  await expect(page.locator('[role="region"][aria-label="QuickDraw AI proposal"]')).toHaveCount(0);

  // Decline is a no-op on the saved document.
  await dialog.getByTestId("decline-artifact").click();
  await expect(dialog).toHaveCount(0);
  expect((await readSaved()).revision).toBe(before.revision);
  expect(JSON.parse((await readSaved()).document).objects).toHaveLength(JSON.parse(before.document).objects.length);

  // Apply the same schema-shaped turn: one dialog, one revision bump, objects carry provenance.
  await sendTurn();
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("apply-artifact").click();
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(async () => (await readSaved()).revision, { timeout: 20_000 }).toBe(before.revision + 1);

  const saved = JSON.parse((await readSaved()).document) as { objects: Array<{ kind: string; prompt?: string; label?: string; provenance?: { status: string; sourceRefs: string[] } }> };
  const kinds = saved.objects.map((object) => object.kind);
  expect(kinds).toContain("question");
  expect(kinds.filter((kind) => kind === "force")).toHaveLength(3);
  expect(saved.objects.every((object) => object.provenance?.status === "generated-unverified")).toBe(true);
  expect(saved.objects.find((object) => object.kind === "question")?.prompt).toContain("three forces");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await readSaved()).revision).toBe(before.revision + 1);
});

test("an invalid brief is reported structurally and leaves the saved board byte-identical", async ({ page }) => {
  const { course, lesson } = await createCourseWithLesson(page.request, `Author board invalid ${Date.now()}`, "Friction lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();

  const url = `/api/canvases?course=${course.id}&lesson=${lesson.id}`;
  await expect.poll(async () => (await page.request.get(url)).ok()).toBe(true);
  const boards = await (await page.request.get(url)).json() as Array<{ id: string }>;
  const boardId = boards[0].id;
  const boardUrl = `/api/canvases/${boardId}?course=${course.id}&lesson=${lesson.id}`;
  const readSaved = async (): Promise<SavedBoard> => (await (await page.request.get(boardUrl)).json()) as SavedBoard;
  const before = await readSaved();

  await page.waitForFunction(() => typeof (window as TestWindow).__studyaiAuthorBoard === "function", null, { timeout: 30_000 });
  const invalid = {
    boardId,
    topic: "friction from module 1",
    artifact: {
      kind: "figure",
      count: 1,
      prompt: "Draw the three forces on the block and name them.",
      concepts: ["friction", "free-body diagram"],
      figure: {
        kind: "freebody",
        title: "Forces on the block",
        context: { surfaceAngleDeg: 0 },
        forces: [
          { label: "normal", components: [100, 0] },
          { label: "friction", components: [0, 100] },
        ],
      },
    },
    placement: { relation: "clear-area" },
    sourceRefs: ["studyai://document/module-1/text/4?chunk=0"],
    reason: "Deliberately invalid force geometry for validation testing.",
  };
  const result = await page.evaluate(async (payload) => (window as TestWindow).__studyaiAuthorBoard!(payload), invalid) as { status: string; error?: string };
  expect(result.status).toBe("rejected");
  expect(result.error).toContain("force-diagram");
  expect(result.error).toContain("requestedCorrection");

  const problem = page.getByTestId("board-artifact-problem");
  await expect(problem).toBeVisible();
  await expect(problem).toContainText("force-diagram:");
  await expect(problem).not.toContainText("componentId");
  await expect(problem).not.toContainText("force-00000000-0000-0000-0000-000000000000");
  await expect(page.getByTestId("board-artifact-proposal")).toHaveCount(0);

  const after = await readSaved();
  expect(after.revision).toBe(before.revision);
  expect(after.document).toBe(before.document);
});
