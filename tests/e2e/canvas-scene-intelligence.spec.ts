import { expect, test } from "@playwright/test";
import { createCourseWithLesson, drawCarbonDioxide, selectCourseOnPage } from "./helpers";

test("scene graph builds from the real board and evidence search stays read-only", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(request, `Scene intelligence ${Date.now()}`, "Scene evidence");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await drawCarbonDioxide(page, false);
  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved", { timeout: 15_000 });

  const rows = await request.get(`/api/canvases?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`).then((response) => response.json());
  expect(rows).toHaveLength(1);
  const boardId = rows[0].id as string;
  const before = await request.get(`/api/canvases/${encodeURIComponent(boardId)}?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`).then((response) => response.json());
  const beforeDocument = JSON.parse(before.document);

  const scenePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/scene") && response.status() === 200,
    { timeout: 30_000 },
  );
  await page.reload();
  const sceneResponse = await scenePromise;
  const scenePayload = await sceneResponse.json();
  expect(scenePayload.indexStatus).toBe("indexed");
  const scene = scenePayload.scene;
  expect(scene).toMatchObject({ schemaVersion: 1, scope: { boardId, courseId: course.id, lessonId: lesson.id }, revision: before.revision });
  expect(scene.revisionHash).toBeTruthy();
  const moleculeNode = scene.nodes.find((node: { kind: string; text: string | null }) => node.kind === "scientific-object" && /carbon/i.test(node.text ?? ""));
  expect(moleculeNode).toBeTruthy();
  expect(scene.nodes.length).toBeLessThanOrEqual(10_000);
  expect(moleculeNode).toMatchObject({ origin: "science", verificationStatus: "source" });

  const boardSearch = await request.post(`/api/canvases/${encodeURIComponent(boardId)}/scene/query`, {
    data: { courseId: course.id, lessonId: lesson.id, revisionHash: scene.revisionHash, query: "carbon", limit: 5 },
  });
  expect(boardSearch.status()).toBe(200);
  const boardHits = await boardSearch.json();
  expect(boardHits.nodes.some((node: { id: string }) => node.id === moleculeNode.id)).toBe(true);

  const courseSearch = await request.post(`/api/courses/${encodeURIComponent(course.id)}/canvas-scene/query`, {
    data: { courseId: course.id, query: "carbon", limit: 5 },
  });
  expect(courseSearch.status()).toBe(200);
  const courseHits = await courseSearch.json();
  expect(courseHits.hits.some((hit: { boardId: string; node: { id: string } }) => hit.boardId === boardId && hit.node.id === moleculeNode.id)).toBe(true);

  const staleRevision = await request.post(`/api/canvases/${encodeURIComponent(boardId)}/scene/query`, {
    data: { courseId: course.id, lessonId: lesson.id, revisionHash: "0".repeat(64), query: "carbon", limit: 5 },
  });
  expect(staleRevision.status()).toBe(409);
  expect(await staleRevision.json()).toMatchObject({ code: "index_unavailable" });

  const wrongCourse = await request.post(`/api/courses/${encodeURIComponent(course.id)}/canvas-scene/query`, {
    data: { courseId: `${course.id}-other`, query: "carbon", limit: 5 },
  });
  expect(wrongCourse.status()).toBe(404);
  expect(await wrongCourse.json()).toMatchObject({ code: "scope_mismatch" });

  const after = await request.get(`/api/canvases/${encodeURIComponent(boardId)}?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`).then((response) => response.json());
  expect(after.revision).toBe(before.revision);
  expect(JSON.parse(after.document)).toEqual(beforeDocument);
  await expect(page.getByRole("region", { name: "QuickDraw AI proposal" })).toHaveCount(0);
});
