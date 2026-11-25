import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1600, height: 1000 } });

test("physics free-body diagram displays interactive angle/magnitude sliders and diagnostics in inspector", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const { course, lesson } = await createCourseWithLesson(request);

  // Navigate and let client initialize the lesson board
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();

  // Fetch the created board once the client has persisted it
  await expect.poll(async () => (await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json())).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const boards = await (await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`)).json();
  const board = boards[0];
  const boardRow = await (await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`)).json();
  const currentDoc = JSON.parse(boardRow.document);

  // Seed board with an invalid normal force and gravity force
  const boardDoc = {
    ...currentDoc,
    objects: [
      {
        id: "fn-1",
        kind: "force",
        x: 400,
        y: 400,
        width: 10,
        height: 80,
        components: [0, 80, 0], // drawn straight up
        units: "N",
        label: "F_N",
        pointOfApplication: { x: 400, y: 400 },
        geometry: { tail: { x: 400, y: 400 }, tip: { x: 400, y: 320 }, unitsPerCanvasUnit: 1 },
      },
      {
        id: "fg-1",
        kind: "force",
        x: 400,
        y: 400,
        width: 10,
        height: 100,
        components: [100, 0, 0], // drawn horizontally (error!)
        units: "N",
        label: "F_g",
        pointOfApplication: { x: 400, y: 400 },
        geometry: { tail: { x: 400, y: 400 }, tip: { x: 500, y: 400 }, unitsPerCanvasUnit: 1 },
      },
    ],
  };

  const saveRes = await request.post("/api/canvases", {
    data: {
      id: board.id,
      courseId: course.id,
      lessonId: lesson.id,
      name: board.name,
      document: boardDoc,
      expectedRevision: board.revision,
    },
  });
  expect(saveRes.ok()).toBe(true);

  // Reload page to display the seeded forces
  await page.reload();
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();

  const forceArrows = page.locator('.science-arrow[data-kind="force"]');
  await expect(forceArrows).toHaveCount(2);

  // Double click the gravity force arrow to inspect it
  await page.getByRole("button", { name: "force F_g" }).dblclick();

  const editor = page.locator(".canvas-object-editor");
  await expect(editor).toBeVisible();

  // Assert angle and magnitude sliders exist
  const angleSlider = editor.getByTestId("force-angle-slider");
  await expect(angleSlider).toBeVisible();

  const magnitudeSlider = editor.getByTestId("force-magnitude-slider");
  await expect(magnitudeSlider).toBeVisible();

  // Assert physics diagnostic alert appears for misdirected gravity
  const alert = editor.getByTestId("physics-diagnostic-alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Gravity must point directly downward");

  // Apply correction
  const correctBtn = editor.getByTestId("apply-physics-correction");
  await expect(correctBtn).toBeVisible();
  await correctBtn.click();

  // Close editor
  await editor.getByRole("button", { name: "Done" }).click();
  await expect(editor).not.toBeVisible();

  // Poll server to confirm corrected components were persisted
  await expect
    .poll(async () => {
      const refreshedBoards = await (await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`)).json();
      const row = await (await request.get(`/api/canvases/${refreshedBoards[0].id}?course=${course.id}&lesson=${lesson.id}`)).json();
      const parsed = JSON.parse(row.document);
      const fg = parsed.objects.find((o: any) => o.id === "fg-1");
      return fg?.components[1];
    })
    .toBeLessThan(-90); // Y component now points downward (-100)
});
