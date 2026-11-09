import { expect, test } from "@playwright/test";
import { pdfFixture } from "../fixtures/document-intelligence.js";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

const dataApi = "/api";

test("imports a PDF, retrieves its fact in the tutor, and opens its page citation", async ({ page, request }) => {
  test.setTimeout(240_000);
  await expect.poll(async () => (await request.get(dataApi + "/courses")).status(), { timeout: 30_000 }).toBe(200);
  await expect.poll(async () => (await request.get("/api/copilotkit/info")).status(), { timeout: 30_000 }).toBe(200);
  await expect.poll(async () => { try { return (await request.get(`http://127.0.0.1:${process.env.AGENT_PORT ?? 8133}/ok`)).status(); } catch { return 0; } }, { timeout: 30_000 }).toBe(200);
  const { course } = await createCourseWithLesson(request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByRole("button", { name: "Lecture", exact: true }).click();

  const input = page.locator(".di-file-input");
  await input.setInputFiles({ name: "citation-proof.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdfFixture("The assigned alloy code is ZORBIUM-417.")) });
  await expect(page.getByText("Indexed", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => {
    const response = await request.get(dataApi + `/document-intelligence/search?course=${course.id}&q=ZORBIUM-417`);
    const body = await response.json();
    return Boolean(body.results?.[0]);
  }, { timeout: 30_000 }).toBe(true);
  const searchResponse = await request.get(dataApi + `/document-intelligence/search?course=${course.id}&q=ZORBIUM-417`);
  const hit = (await searchResponse.json()).results[0] as { documentId: string; filename: string; unitType: string; unitNumber: number; sourceRef: string };

  try {
    expect(hit.filename).toBe("citation-proof.pdf");
    expect(hit.unitType).toBe("page");
    expect(hit.unitNumber).toBe(1);
    const chat = page.getByTestId("copilot-chat-textarea");
    await chat.fill("According to my imported lecture, what is the assigned alloy code? Separate sourced information from general knowledge and cite the page.");
    await chat.press("Enter");
    await expect(page.getByText("ZORBIUM-417", { exact: false }).last()).toBeVisible({ timeout: 180_000 });
    const citation = page.locator('a[href^="#studyai-citation="]').filter({ hasText: "citation-proof.pdf" }).last();
    await expect(citation).toBeVisible({ timeout: 30_000 });
    await expect(citation).toContainText("page 1");
    await citation.click();
    await expect(page.getByRole("dialog", { name: "citation-proof.pdf" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Page 1 of 1")).toBeVisible();
  } finally {
    await request.delete(dataApi + "/document-intelligence/documents/" + encodeURIComponent(hit.documentId) + `?course=${course.id}`).catch(() => undefined);
  }
});

test("keeps the document reader in the lecture pane while canvas and tutor remain usable", async ({ page, request }) => {
  test.setTimeout(60_000);
  const { course } = await createCourseWithLesson(request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.locator(".di-file-input").setInputFiles({ name: "workspace-reader.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdfFixture("A source page for simultaneous study.")) });
  await expect(page.getByText("Indexed", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /workspace-reader\.pdf/ }).click();
  await expect(page.locator(".di-viewer-body")).toBeVisible();

  const viewer = await page.locator(".di-viewer").boundingBox();
  const lecture = await page.locator(".lecture-pane").boundingBox();
  expect(viewer).not.toBeNull();
  expect(lecture).not.toBeNull();
  expect(viewer!.x).toBeGreaterThanOrEqual(lecture!.x);
  expect(viewer!.y).toBeGreaterThanOrEqual(lecture!.y);
  expect(viewer!.x + viewer!.width).toBeLessThanOrEqual(lecture!.x + lecture!.width);
  expect(viewer!.y + viewer!.height).toBeLessThanOrEqual(lecture!.y + lecture!.height);

  await expect(page.locator(".canvas-board")).toBeVisible();
  await expect(page.locator(".tutor-header")).toBeVisible();
  await expect(page.locator(".di-viewer")).not.toHaveAttribute("aria-modal", "true");
});
