import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

type GraphNode = { id: string; label: string; mastery: number; lessonId: string; canPractice: boolean };

test("course concept graph shows truthful mastery, a saved relationship, and jumps a weak concept to practice", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(request, `Concepts ${Date.now()}`, "Concept graph lesson");
  const source = await request.post("/api/documents", {
    data: { courseId: course.id, name: "cell-notes.txt", content: "A cell contains DNA in its nucleus. Genes carry hereditary information." },
  });
  expect(source.ok()).toBeTruthy();
  const documentId = (await source.json()).id as string;
  for (const [concept, prompt, excerpt] of [
    ["Cell biology", "Where is DNA located?", "A cell contains DNA in its nucleus."],
    ["Genetics", "What do genes carry?", "Genes carry hereditary information."],
  ]) {
    const created = await request.post("/api/study/questions", {
      data: {
        courseId: course.id, lessonId: lesson.id, concept, prompt,
        choices: [{ id: "right", text: "From the source" }, { id: "wrong", text: "Not in the source" }],
        correctChoice: "right", explanation: "The course source states this directly.",
        sourceDocumentId: documentId, sourceExcerpt: excerpt, reviewed: true,
      },
    });
    expect(created.status()).toBe(201);
  }

  const graphUrl = `/api/concepts/graph?course=${encodeURIComponent(course.id)}`;
  const initial = await request.get(graphUrl).then((response) => response.json() as Promise<{ nodes: GraphNode[] }>);
  expect(initial.nodes).toHaveLength(2);
  const weak = initial.nodes.find((node) => node.label === "Cell biology")!;
  const question = await request.get(`/api/study/ask?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}&concept=${weak.id}`).then((response) => response.json());
  const answered = await request.post("/api/study/attempts", {
    data: { presentationId: question.presentationId, idempotencyKey: crypto.randomUUID(), choiceId: "wrong" },
  });
  expect(answered.ok()).toBeTruthy();

  const afterAnswer = await request.get(graphUrl).then((response) => response.json() as Promise<{ nodes: GraphNode[] }>);
  const mastery = afterAnswer.nodes.find((node) => node.id === weak.id)!.mastery;
  expect(mastery).toBeLessThan(0.5);
  const genetics = afterAnswer.nodes.find((node) => node.label === "Genetics")!;
  const saved = await request.post("/api/canvases", {
    data: {
      courseId: course.id, lessonId: lesson.id, name: "Concept relationships", expectedRevision: 0,
      document: {
        version: 1, snapshot: { document: { store: {} } },
        objects: [
          { id: "co1", kind: "concept", x: 0, y: 0, width: 160, height: 70, title: "Cell biology", definition: "Course concept", conceptId: weak.id },
          { id: "co2", kind: "concept", x: 0, y: 0, width: 160, height: 70, title: "Genetics", definition: "Course concept", conceptId: genetics.id },
          { id: "rel1", kind: "relationship", x: 0, y: 0, width: 40, height: 20, fromId: "co1", toId: "co2", label: "prerequisite of" },
        ],
      },
    },
  });
  expect(saved.ok()).toBeTruthy();

  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByTestId("open-concept-graph").click();
  await expect(page.getByTestId("concept-graph-surface")).toBeVisible();
  await expect(page.getByTestId("concept-graph")).toBeVisible();
  await expect(page.getByTestId("mind-map-node")).toHaveCount(2);
  await expect(page.getByTestId("concept-graph-legend")).toContainText("2 concepts");
  await expect(page.getByTestId("concept-graph-legend")).toContainText("1 canvas relationships");
  await expect(page.locator(".react-flow__edge").first()).toBeVisible();

  for (const node of afterAnswer.nodes) {
    const label = `${Math.round(node.mastery * 100)}%`;
    await expect(page.locator(`[data-testid="concept-mastery"][data-concept="${node.label}"]`)).toHaveText(`Mastery ${label}`);
  }
  await page.screenshot({ path: "test-results/concept-graph-surface.png", fullPage: true });
  await page.evaluate(() => document.querySelector(".app-shell")?.classList.add("dark"));
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/concept-graph-dark.png", fullPage: true });
  await page.evaluate(() => document.querySelector(".app-shell")?.classList.remove("dark"));

  await page.locator('[data-testid="concept-practice"][data-concept="Cell biology"]').click();
  await expect(page.getByRole("dialog", { name: "Study session" })).toBeVisible();
  await expect(page.getByTestId("study-concept")).toHaveText("Cell biology");
  await expect(page.getByRole("heading", { name: "Where is DNA located?" })).toBeVisible();
  await page.screenshot({ path: "test-results/concept-graph-practice.png", fullPage: true });
});
