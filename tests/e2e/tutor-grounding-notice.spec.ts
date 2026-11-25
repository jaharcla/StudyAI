import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("tutor answer shows the checked source count", async ({ page, request }) => {
  test.setTimeout(240_000);
  const { course } = await createCourseWithLesson(request, `Grounding notice ${Date.now()}`, "Slope lesson");
  const document = await request.post("/api/documents", {
    data: { courseId: course.id, name: "slope-notes.txt", content: "The assigned slope is 0.9." },
  });
  expect(document.ok()).toBeTruthy();
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect.poll(async () => (await request.get(`/api/document-intelligence/search?course=${course.id}&q=slope`).then((response) => response.json())).results?.length ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);

  const chat = page.getByTestId("copilot-chat-textarea");
  await chat.fill("According to my course notes, what is the assigned slope?");
  await chat.press("Enter");
  await expect(page.locator(".copilot-assistant-message-content").last()).toContainText("Course evidence ·", { timeout: 180_000 });
});

test("tutor answer says when the course has no evidence", async ({ page, request }) => {
  test.setTimeout(240_000);
  const { course } = await createCourseWithLesson(request, `Grounding refusal ${Date.now()}`, "No evidence lesson");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);

  const chat = page.getByTestId("copilot-chat-textarea");
  await chat.fill("qzxv synthetic nonmatching phrase about quantumzeptol");
  await chat.press("Enter");
  await expect(page.locator(".copilot-assistant-message-content").last()).toContainText("No course evidence · Not in your course material", { timeout: 180_000 });
});
