import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("teaches selected ink and records label feedback through the canvas panel", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(request, `Recognition review ${Date.now()}`, "Canvas labels");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await page.getByRole("button", { name: "Draw — D" }).click();
  const box = (await page.locator(".canvas-board").boundingBox())!;
  const x1 = box.x + 300;
  const y1 = box.y + 200;
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x1 + 80, y1 + 40, { steps: 6 });
  await page.mouse.move(x1 + 140, y1 - 20, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved", { timeout: 15_000 });

  const rows = await request.get(`/api/canvases?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`).then((response) => response.json());
  expect(rows).toHaveLength(1);
  const boardId = rows[0].id as string;
  const board = await request.get(`/api/canvases/${encodeURIComponent(boardId)}?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`).then((response) => response.json());
  const document = JSON.parse(board.document);
  const stroke = Object.values(document.snapshot.document.store).find((shape: any) => shape.type === "draw") as { id: string } | undefined;
  expect(stroke).toBeTruthy();

  const bounds = { x: x1, y: y1, width: 160, height: 80 };
  const sourceRefs = [{ scope: "quickdraw" as const, id: stroke!.id }];
  const graph = {
    schemaVersion: 1,
    scope: { boardId, courseId: course.id, lessonId: lesson.id },
    revision: board.revision,
    revisionHash: "canvas-label-e2e-revision",
    snapshotHash: "canvas-label-e2e-snapshot",
    builderVersion: "e2e",
    builtAt: new Date().toISOString(),
    nodes: [
      { id: "g:e2e", kind: "stroke-group", ref: { scope: "scene", id: "g:e2e" }, bounds, boundsBasis: "source-union", text: null, recordType: "stroke-group", origin: "geometry", verificationStatus: "derived", confidence: 1, sourceRefs, geometry: null, uncertaintyReasons: [] },
      { id: "c:e2e", kind: "recognition-candidate", ref: { scope: "scene", id: "c:e2e" }, bounds, boundsBasis: "derived", text: "spring", recordType: "symbol", origin: "geometry", verificationStatus: "unconfirmed", confidence: 0.52, sourceRefs, geometry: null, uncertaintyReasons: ["Recognition candidate; not user-confirmed."] },
    ],
    edges: [{ id: "e:e2e", kind: "recognizes", from: "c:e2e", to: "g:e2e", origin: "geometry", verificationStatus: "unconfirmed", basis: "recognition", distance: null, confidence: 0.52, sourceRefs, uncertaintyReasons: [] }],
    warnings: [],
    truncated: false,
  };
  let confirmed = false;
  const teachBodies: Array<Record<string, any>> = [];
  const feedbackBodies: Array<Record<string, any>> = [];
  await page.route(/\/api\/canvases\/[^/]+\/scene$/, async (route) => {
    const scene = structuredClone(graph);
    if (confirmed) {
      const candidate = scene.nodes.find((node) => node.id === "c:e2e")!;
      Object.assign(candidate, { origin: "user", verificationStatus: "confirmed", uncertaintyReasons: [] });
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ scene, indexStatus: "indexed", warnings: [] }) });
  });
  await page.route(/\/api\/canvases\/[^/]+\/recognition\/teach$/, async (route) => {
    teachBodies.push(route.request().postDataJSON() as Record<string, any>);
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ label: "spring", examples: 1 }) });
  });
  await page.route(/\/api\/canvases\/[^/]+\/recognition\/feedback$/, async (route) => {
    const body = route.request().postDataJSON() as Record<string, any>;
    feedbackBodies.push(body);
    if (body.decision === "accept") confirmed = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "saved", decision: body.decision, groupKey: stroke!.id, prototype: "updated", warnings: [] }) });
  });

  await page.reload();
  await expect(page.getByRole("button", { name: "Review canvas labels" })).toBeVisible();
  await page.getByRole("button", { name: "Select — V" }).click();
  await page.mouse.click(x1 + 40, y1 + 20);
  await page.getByRole("button", { name: "Review canvas labels" }).click();
  const panel = page.getByRole("region", { name: "Canvas recognition review" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("spring", { timeout: 10_000 });

  await page.getByLabel("Recognition label").fill("spring");
  await page.getByRole("button", { name: "Teach selected drawing" }).click();
  await expect.poll(() => teachBodies.length).toBe(1);
  expect(teachBodies[0]).toMatchObject({ courseId: course.id, lessonId: lesson.id, strokeIds: [stroke!.id], label: "spring" });
  expect(teachBodies[0]).not.toHaveProperty("pngBase64");

  await panel.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => feedbackBodies.length).toBe(1);
  expect(feedbackBodies[0]).toMatchObject({ courseId: course.id, lessonId: lesson.id, strokeIds: [stroke!.id], decision: "accept", label: "spring" });
  await expect(panel).toContainText("confirmed", { timeout: 10_000 });

  const after = await request.get(`/api/canvases/${encodeURIComponent(boardId)}?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`).then((response) => response.json());
  expect(after.revision).toBe(board.revision);
  expect(JSON.parse(after.document)).toEqual(document);
});
