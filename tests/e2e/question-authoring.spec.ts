import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.setTimeout(90000);

async function seedDocument(request: import("@playwright/test").APIRequestContext, courseId: string) {
  const response = await request.post("/api/documents", { data: { courseId, name: "bio.txt", content: "A cell contains DNA in its nucleus." } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id as string;
}

async function openAuthorForm(page: import("@playwright/test").Page, courseTitle: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, courseTitle);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
  await page.getByRole("button", { name: "Study", exact: true }).click();
  await page.getByRole("button", { name: "Add a question" }).click();
  await expect(page.getByTestId("question-author")).toBeVisible();
}

async function fillForm(page: import("@playwright/test").Page, documentId: string, excerpt: string) {
  await page.getByLabel("Concept").fill("Cell biology");
  await page.getByLabel("Prompt").fill("Where is DNA?");
  await page.getByRole("textbox", { name: "Choice 1" }).fill("Nucleus");
  await page.getByRole("textbox", { name: "Choice 2" }).fill("Ribosome");
  await page.getByLabel("Source document").selectOption(documentId);
  await page.getByLabel("Source excerpt").fill(excerpt);
  await page.getByLabel("Explanation").fill("Custom explanation from the author.");
}

test("authors a question from a cited excerpt and can answer it", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Author ${Date.now()}`, "Author lesson");
  const documentId = await seedDocument(request, course.id);
  await openAuthorForm(page, course.title);
  await fillForm(page, documentId, "A cell contains DNA in its nucleus.");
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByTestId("question-author")).toBeHidden();
  await page.getByRole("button", { name: "Ask a reviewed question" }).click();
  await expect(page.getByRole("heading", { name: "Where is DNA?" })).toBeVisible();
  await page.getByRole("button", { name: "Nucleus", exact: true }).click();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByText("Custom explanation from the author.")).toBeVisible();
});

test("rejects an excerpt that is not in the document", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Bad citation ${Date.now()}`, "Citation lesson");
  const documentId = await seedDocument(request, course.id);
  await openAuthorForm(page, course.title);
  await fillForm(page, documentId, "not in the source");
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByRole("status")).toContainText("Citation must match text and page");
  await expect(page.getByTestId("question-author")).toBeVisible();
});
