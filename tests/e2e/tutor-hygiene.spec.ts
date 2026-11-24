import { expect, test } from "@playwright/test";
import { pdfFixture } from "../fixtures/document-intelligence.js";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("tutor answers hide reasoning, ship one citation grammar and no placeholder links", async ({ page, request }) => {
  test.setTimeout(240_000);
  await expect.poll(async () => (await request.get("/api/copilotkit/info")).status(), { timeout: 30_000 }).toBe(200);
  const { course } = await createCourseWithLesson(request, `Tutor hygiene ${Date.now()}`, "Quantum theory");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByRole("button", { name: "Lecture", exact: true }).click();

  const marker = `HYGIENE-${Date.now()}`;
  const input = page.locator(".di-file-input");
  await expect(input).toBeAttached({ timeout: 30_000 });
  await input.setInputFiles({ name: "hygiene-proof.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdfFixture(`The lecture marker is ${marker}.`)) });
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
  await expect(assistant.last()).toContainText(marker, { timeout: 180_000 });

  const answer = await assistant.last().innerText();
  expect(answer).not.toMatch(/<think|Need search docs|Let me cite|selectedCount|URL_ENCODED_SOURCE_REF|SOURCE_REF/i);
  expect(answer).not.toMatch(/\(canvas:\s*(?:quickdraw|science):/i);

  // Every citation is a link using the single app-wide grammar.
  const citations = tutor.locator('a[href^="#studyai-citation="]');
  await expect(citations.first()).toBeVisible({ timeout: 30_000 });
  await expect(citations.first()).toContainText("hygiene-proof.pdf");
  const href = await citations.first().getAttribute("href");
  expect(href).toMatch(/^#studyai-citation=.+/);

  await page.screenshot({ path: "test-results/tutor-hygiene/answer.png" });

  await chat.fill("What does the board show? Do not edit it.");
  await chat.press("Enter");
  await expect.poll(async () => (await assistant.last().innerText()).trim().length, { timeout: 180_000 }).toBeGreaterThan(20);
  const boardAnswer = await assistant.last().innerText();
  expect(boardAnswer).not.toMatch(/Need search docs|selectedCount|URL_ENCODED_SOURCE_REF|SOURCE_REF/i);
  expect(boardAnswer).not.toMatch(/\(canvas:\s*(?:quickdraw|science):/i);
  await page.screenshot({ path: "test-results/tutor-hygiene/board-answer.png" });
});
