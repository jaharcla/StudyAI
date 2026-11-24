import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { pdfFixture } from "../fixtures/document-intelligence.js";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

const SHOTS = "test-results/tutor-round2";
const NO_REASONING = /Thought for|Thinking…|Need search docs|Let me cite|selectedCount|URL_ENCODED_SOURCE_REF|SOURCE_REF/i;
const NO_BUDGET_ERROR = /context budget|exceed the Tutor|Narrow the active canvas selection/i;

test("grounded tutor answers hide reasoning and ship real citations", async ({ page, request }) => {
  test.setTimeout(300_000);
  mkdirSync(SHOTS, { recursive: true });
  await expect.poll(async () => (await request.get("/api/copilotkit/info")).status(), { timeout: 30_000 }).toBe(200);
  const { course } = await createCourseWithLesson(request, `Tutor round2 ${Date.now()}`, "Quantum theory");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByRole("button", { name: "Lecture", exact: true }).click();

  const marker = `ROUND2-${Date.now()}`;
  await page.locator(".di-file-input").setInputFiles({ name: "round2-proof.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdfFixture(`The lecture marker is ${marker}. It appears on page 1.`)) });
  await expect(page.getByText("Indexed", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => {
    const response = await request.get(`/api/document-intelligence/search?course=${course.id}&q=${marker}`);
    return Boolean((await response.json()).results?.[0]);
  }, { timeout: 30_000 }).toBe(true);

  const tutor = page.locator(".copilot-slot");
  const assistant = tutor.locator('[data-testid="copilot-assistant-message"]');
  const chat = page.getByTestId("copilot-chat-textarea");
  await chat.fill(`According to my imported lecture, what is the marker ${marker}? Cite the page.`);
  await chat.press("Enter");
  await expect(assistant.last()).toContainText(marker, { timeout: 240_000 });
  await page.waitForTimeout(2_000);

  const panel = await tutor.innerText();
  expect(panel).toContain(marker);
  expect(panel).not.toMatch(NO_REASONING);
  expect(panel).not.toMatch(NO_BUDGET_ERROR);
  expect(panel).not.toMatch(/\(\s*\)/);

  const citations = tutor.locator('a[href^="#studyai-citation="]');
  await expect(citations.first()).toBeVisible({ timeout: 30_000 });
  await expect(citations.first()).toContainText("round2-proof.pdf");
  await page.screenshot({ path: `${SHOTS}/grounded-answer.png` });
});

test("a selected scientific object answers without a raw budget error", async ({ page, request }) => {
  test.setTimeout(300_000);
  mkdirSync(SHOTS, { recursive: true });
  await expect.poll(async () => (await request.get("/api/copilotkit/info")).status(), { timeout: 30_000 }).toBe(200);
  const { course } = await createCourseWithLesson(request, `Tutor round2 board ${Date.now()}`, "Inverse square laws");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);

  await page.getByRole("button", { name: "Equation", exact: true }).click();
  const board = page.locator(".canvas-board");
  const bounds = (await board.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator('[data-kind="equation"]')).toHaveCount(1);
  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved");

  const tutor = page.locator(".copilot-slot");
  const assistant = tutor.locator('[data-testid="copilot-assistant-message"]');
  const chat = page.getByTestId("copilot-chat-textarea");
  await chat.fill("Explain the selected equation on this board in one short paragraph. Do not edit the board.");
  await chat.press("Enter");
  await expect.poll(async () => (await assistant.last().innerText()).trim().length, { timeout: 240_000 }).toBeGreaterThan(40);
  await page.waitForTimeout(2_000);

  const panel = await tutor.innerText();
  expect(panel).not.toMatch(NO_REASONING);
  expect(panel).not.toMatch(NO_BUDGET_ERROR);
  expect(panel).not.toMatch(/\(\s*\)/);
  await page.screenshot({ path: `${SHOTS}/selected-object-answer.png` });
});
