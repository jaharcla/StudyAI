import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

async function status(page: import("@playwright/test").Page, url: string) {
  try { return (await page.request.get(url, { timeout: 1000 })).status(); } catch { return 0; }
}

test("Copilot proposes a Quickdraw edit without replacing scientific canvas objects", async ({ page }) => {
  test.setTimeout(240_000);
  await expect.poll(() => status(page, "/api/courses"), { timeout: 30_000 }).toBe(200);
  await expect.poll(() => status(page, "/api/copilotkit/info"), { timeout: 30_000 }).toBe(200);
  await expect.poll(() => status(page, `http://127.0.0.1:${process.env.AGENT_PORT ?? 8133}/ok`), { timeout: 30_000 }).toBe(200);
  const { course, lesson } = await createCourseWithLesson(page.request, `QuickDraw AI ${Date.now()}`);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);

  const board = page.locator(".canvas-board");
  await expect(board).toBeVisible();
  await page.getByRole("button", { name: "Equation", exact: true }).click();
  const bounds = (await board.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator('[data-kind="equation"]')).toHaveCount(1);
  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved");

  const boards = await (await page.request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`)).json();
  const boardId = boards[0].id as string;
  await page.getByRole("button", { name: "Settings", exact: true }).last().click();
  await expect(page.getByTestId("model-select").locator("option")).not.toHaveCount(0);
  await page.getByTestId("model-select").selectOption("qwen3:latest");
  await page.getByRole("button", { name: "Done", exact: true }).click();

  const chat = page.getByTestId("copilot-chat-textarea");
  await chat.fill(`Use propose_canvas_action to create a blue text label "Approved AI label" at x=250, y=200 on board ${boardId}. Preserve all existing content.`);
  await chat.press("Enter");
  const proposal = page.getByRole("region", { name: "QuickDraw AI proposal" });
  await expect(proposal).toBeVisible({ timeout: 180_000 });
  await expect(proposal).toContainText("Approved AI label");
  await proposal.getByRole("button", { name: "Apply canvas proposal" }).click();
  await expect.poll(async () => {
    const saved = await (await page.request.get(`/api/canvases/${boardId}?course=${course.id}&lesson=${lesson.id}`)).json();
    const document = JSON.parse(saved.document);
    const shapes = Object.values(document.snapshot.document.store) as Array<{ typeName?: string; props?: { text?: string } }>;
    return { text: shapes.some((shape) => shape.typeName === "shape" && shape.props?.text === "Approved AI label"), equations: document.objects.filter((object: { kind?: string }) => object.kind === "equation").length };
  }, { timeout: 20_000 }).toEqual({ text: true, equations: 1 });

  await page.reload();
  await expect(page.locator('[data-kind="equation"]')).toHaveCount(1);
  await expect.poll(async () => {
    const saved = await (await page.request.get(`/api/canvases/${boardId}?course=${course.id}&lesson=${lesson.id}`)).json();
    const document = JSON.parse(saved.document);
    const shapes = Object.values(document.snapshot.document.store) as Array<{ typeName?: string; props?: { text?: string } }>;
    return { text: shapes.some((shape) => shape.typeName === "shape" && shape.props?.text === "Approved AI label"), equations: document.objects.filter((object: { kind?: string }) => object.kind === "equation").length };
  }).toEqual({ text: true, equations: 1 });
});
