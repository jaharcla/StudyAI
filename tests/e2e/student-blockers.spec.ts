import { expect, test } from "@playwright/test";
import { docxFixture, pdfFixture } from "../fixtures/document-intelligence.js";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

async function openLecture(page: import("@playwright/test").Page, title: string): Promise<void> {
  await page.goto("/");
  await selectCourseOnPage(page, title);
  await page.getByRole("button", { name: "Lecture", exact: true }).click();
  await expect(page.locator(".di-dropzone")).toBeVisible();
}

test("Document Library imports a DOCX with honest progress and a retryable failure", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Upload DOCX ${Date.now()}`, "Upload lesson");
  let fail = true;
  await page.route("**/api/document-intelligence/import", async (route) => {
    if (fail) return route.fulfill({ status: 502, contentType: "application/json", body: '{"error":"Document service unavailable."}' });
    return route.continue();
  });
  await openLecture(page, course.title);
  await expect(page.getByTestId("di-library-empty")).toBeVisible();

  const file = { name: "ion-notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(docxFixture()) };
  await page.locator(".di-file-input").setInputFiles(file);
  const row = page.getByTestId("di-upload-row").first();
  await expect(row).toContainText("Document service unavailable.");
  await expect(page.getByTestId("di-upload-retry")).toBeVisible();

  fail = false;
  await page.getByTestId("di-upload-retry").click();
  await expect(page.getByText("Indexed", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /ion-notes\.docx/ })).toBeVisible();
});

test("Document Library rejects an oversized file with a clear message", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Upload oversize ${Date.now()}`, "Upload lesson");
  await openLecture(page, course.title);
  const big = Buffer.alloc(21 * 1024 * 1024, 0x61);
  await page.locator(".di-file-input").setInputFiles({ name: "huge.txt", mimeType: "text/plain", buffer: big });
  await expect(page.getByTestId("di-upload-row").first()).toContainText("exceeds 20 MB");
  await expect(page.getByText("Indexed", { exact: true })).toHaveCount(0);
});

test("Document Library explains a full course storage and how to recover", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Storage full ${Date.now()}`, "Upload lesson");
  await page.route("**/api/document-intelligence/import", (route) => route.fulfill({ status: 507, contentType: "application/json", body: '{"error":"Course storage is full. Delete documents or courses to free space."}' }));
  await openLecture(page, course.title);
  await page.locator(".di-file-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Course notes") });
  await expect(page.getByTestId("di-upload-row").first()).toContainText(/storage is full/i);
  await expect(page.getByTestId("di-storage-help")).toContainText(/delete/i);
});

test("course selector deletes a course after confirmation and cleans up its work", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Delete course ${Date.now()}`, "Doomed lesson");
  const importResponse = await request.post("/api/document-intelligence/import", {
    data: { courseId: course.id, lessonId: lesson.id, files: [{ name: "doomed.txt", contentBase64: Buffer.from("doomed source").toString("base64") }] },
  });
  expect(importResponse.ok()).toBeTruthy();
  const boardResponse = await request.post("/api/canvases", {
    data: { id: `doomed-${Date.now()}`, courseId: course.id, lessonId: lesson.id, name: "Doomed board", expectedRevision: 0, document: { version: 1, snapshot: { document: { store: {} } }, objects: [] } },
  });
  expect(boardResponse.ok()).toBeTruthy();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByTitle("Toggle courses").click();
  await page.getByTestId(`delete-course-${course.id}`).click();
  await expect(page.locator(".course-list").getByRole("button", { name: new RegExp(course.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toHaveCount(0);
  await expect.poll(async () => {
    const rows = await request.get("/api/courses").then((response) => response.json()) as Array<{ id: string }>;
    return rows.some((row) => row.id === course.id);
  }).toBe(false);
  const lessons = await request.get(`/api/lessons?course=${course.id}`);
  expect(lessons.status()).toBe(404);
  const documents = await request.get(`/api/document-intelligence/documents?course=${course.id}`);
  expect((await documents.json()).documents).toEqual([]);
  const canvases = await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`);
  expect(canvases.status()).toBe(404);
});

test("board switching is discoverable and switches the active board", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Switch board ${Date.now()}`, "Board lesson");
  await request.post("/api/canvases", {
    data: { id: `first-${Date.now()}`, courseId: course.id, lessonId: lesson.id, name: "First board", expectedRevision: 0, document: { version: 1, snapshot: { document: { store: {} } }, objects: [] } },
  });
  await request.post("/api/canvases", {
    data: { id: `second-${Date.now()}`, courseId: course.id, lessonId: lesson.id, name: "Second board", expectedRevision: 0, document: { version: 1, snapshot: { document: { store: {} } }, objects: [] } },
  });
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await page.getByTestId("board-selector").click();
  const options = page.getByTestId("board-option");
  await expect(options).toHaveCount(2);
  await options.filter({ hasText: "Second board" }).click();
  await expect(page.getByTestId("board-selector")).toContainText("Second board");
});

test("scientific objects can be selected in bulk and deleted together", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Bulk delete ${Date.now()}`, "Objects lesson");
  const boardId = `objects-${Date.now()}`;
  const objects = [
    { id: "obj-a", kind: "concept", x: 100, y: 100, width: 160, height: 80, title: "Force", definition: "A push or pull" },
    { id: "obj-b", kind: "concept", x: 300, y: 100, width: 160, height: 80, title: "Mass", definition: "Amount of matter" },
  ];
  await request.post("/api/canvases", {
    data: { id: boardId, courseId: course.id, lessonId: lesson.id, name: "Objects board", expectedRevision: 0, document: { version: 1, snapshot: { document: { store: {} } }, objects } },
  });

  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByTestId("manage-objects").click();
  const panel = page.getByTestId("objects-panel");
  const checkboxes = panel.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(2);
  await checkboxes.first().check();
  await checkboxes.nth(1).check();
  await panel.getByTestId("delete-selected-objects").click();
  await expect(panel.getByText("No objects on this board")).toBeVisible();
  await expect.poll(async () => {
    const row = await request.get(`/api/canvases/${boardId}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json()) as { document: string };
    return (JSON.parse(row.document) as { objects: unknown[] }).objects.length;
  }).toBe(0);
});
