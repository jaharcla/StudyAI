import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

type TestWindow = Window & { __studyaiAuthorBoard?: (input: unknown) => Promise<unknown> };
type SavedBoard = { revision: number; document: string };

const sourceRef = "studyai://document/module-1/text/4?chunk=0";

const workedTurn = (boardId: string) => ({
  boardId,
  topic: "friction from module 1",
  artifact: {
    kind: "worked-example",
    count: 1,
    prompt: "Draw the three forces on the block.",
    answer: "Friction opposes the motion down the slope.",
    concepts: ["friction"],
    states: [
      { id: "setup", narration: "Set up the incline and the block.", reveal: ["question"], highlight: ["question"] },
      { id: "forces", narration: "Add gravity, normal and friction.", reveal: ["gravity", "normal", "friction"], highlight: ["friction"] },
      { id: "result", narration: "Friction opposes the motion down the slope.", reveal: [], highlight: ["friction"] },
    ],
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
  sourceRefs: [sourceRef],
  reason: "A replayable worked example for the friction lesson.",
});

test.setTimeout(150_000);

test("a worked example replays, pauses, takes over and keeps provenance without writing the board", async ({ page }) => {
  const { course, lesson } = await createCourseWithLesson(page.request, `Steppable ${Date.now()}`, "Friction lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();

  const boardsUrl = `/api/canvases?course=${course.id}&lesson=${lesson.id}`;
  await expect.poll(async () => (await page.request.get(boardsUrl)).ok()).toBe(true);
  await expect.poll(async () => ((await (await page.request.get(boardsUrl)).json()) as Array<{ id: string }>).length).toBeGreaterThan(0);
  const boardId = ((await (await page.request.get(boardsUrl)).json()) as Array<{ id: string }>)[0].id;
  const boardUrl = `/api/canvases/${boardId}?course=${course.id}&lesson=${lesson.id}`;
  const readSaved = async (): Promise<SavedBoard> => (await (await page.request.get(boardUrl)).json()) as SavedBoard;
  const before = await readSaved();

  const sendTurn = async () => {
    await page.waitForFunction(() => typeof (window as TestWindow).__studyaiAuthorBoard === "function", null, { timeout: 30_000 });
    const result = await page.evaluate(async (payload) => (window as TestWindow).__studyaiAuthorBoard!(payload), workedTurn(boardId));
    expect(result).toMatchObject({ status: "pending_user_review" });
  };

  // Decline is a no-op on the saved document, even for a steppable example.
  await sendTurn();
  const dialog = page.getByTestId("board-artifact-proposal");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("decline-artifact").click();
  await expect(dialog).toHaveCount(0);
  expect((await readSaved()).document).toBe(before.document);
  await expect(page.getByTestId("steppable-rail")).toHaveCount(0);

  await sendTurn();
  await dialog.getByTestId("apply-artifact").click();
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(async () => (await readSaved()).revision, { timeout: 20_000 }).toBe(before.revision + 1);
  const applied = await readSaved();

  const rail = page.getByTestId("steppable-rail");
  await expect(rail).toBeVisible();
  await expect(rail.getByTestId("steppable-step-label")).toHaveText("Step 1 of 3");
  await expect(rail.getByTestId("steppable-narration")).toContainText("Set up the incline");
  await expect(page.locator(".steppable-dimmed").first()).toBeVisible();
  await page.screenshot({ path: "C:/Users/Owner/AppData/Local/Temp/opencode/steppable-1-step1.png" });

  await rail.getByTestId("steppable-next").click();
  await rail.getByTestId("steppable-next").click();
  await expect(rail.getByTestId("steppable-step-label")).toHaveText("Step 3 of 3");
  await expect(rail.getByTestId("steppable-narration")).toContainText("Friction opposes the motion");
  await expect(page.locator(".steppable-highlight").first()).toBeVisible();
  await page.screenshot({ path: "C:/Users/Owner/AppData/Local/Temp/opencode/steppable-2-step3.png" });

  await rail.getByTestId("steppable-jump").selectOption("1");
  await expect(rail.getByTestId("steppable-step-label")).toHaveText("Step 2 of 3");
  await rail.getByTestId("steppable-prev").click();
  await expect(rail.getByTestId("steppable-step-label")).toHaveText("Step 1 of 3");

  await rail.getByTestId("steppable-play").click();
  await expect(rail.getByTestId("steppable-pause")).toBeVisible();
  await rail.getByTestId("steppable-pause").click();
  const frozen = await rail.getByTestId("steppable-step-label").textContent();
  await page.waitForTimeout(1800);
  expect(await rail.getByTestId("steppable-step-label").textContent()).toBe(frozen);

  // Navigation and playback are view state only: revision and document bytes never move.
  const afterNav = await readSaved();
  expect(afterNav.revision).toBe(applied.revision);
  expect(afterNav.document).toBe(applied.document);

  // Provenance survives every state.
  await expect(rail.getByTestId("generated-unverified")).toContainText(/generated, not verified/i);
  await expect(rail.locator("a[href*='studyai-citation']")).toHaveCount(1);

  // Take over is a mode switch: no board write, no second dialog, filter cleared.
  await rail.getByTestId("steppable-takeover").click();
  await expect(rail).toContainText("Your turn");
  await expect(page.locator(".steppable-dimmed")).toHaveCount(0);
  expect((await readSaved()).revision).toBe(applied.revision);
  expect((await readSaved()).document).toBe(applied.document);
  await expect(rail.getByTestId("generated-unverified")).toBeVisible();
  await expect(rail.locator("a[href*='studyai-citation']")).toHaveCount(1);
  await page.screenshot({ path: "C:/Users/Owner/AppData/Local/Temp/opencode/steppable-3-takeover.png" });

  // The first real edit takes the normal single-revision, single-undo path.
  await page.locator('[data-scientific-id][data-kind="question"]').first().click();
  await page.getByRole("button", { name: "Inspect selected object" }).click();
  await page.getByRole("textbox", { name: "Question" }).fill("Draw the three forces and name them now.");
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await readSaved()).revision, { timeout: 20_000 }).toBe(applied.revision + 1);
  await expect(page.getByTestId("steppable-rail")).toBeVisible();
  await expect(page.getByTestId("steppable-rail").getByTestId("generated-unverified")).toBeVisible();

  await page.getByRole("button", { name: "Undo canvas change" }).click();
  await expect.poll(async () => (await readSaved()).revision, { timeout: 20_000 }).toBe(applied.revision + 2);
  await expect(page.getByTestId("steppable-rail")).toBeVisible();
});
