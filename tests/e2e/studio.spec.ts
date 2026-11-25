import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

const REF = "studyai://document/doc-1/page/1?chunk=0";
const base = (kind: string, content: unknown) => ({ id: `art-${kind}`, courseId: "c", lessonId: "l", kind, title: `Generated ${kind}`, content, sourceRefs: [REF], createdAt: new Date().toISOString() });

const fixtures: Record<string, unknown> = {
  "mind-map": base("mind-map", {
    title: "Forces",
    nodes: [
      { id: "root", label: "Forces", parentId: null },
      { id: "a", label: "Equilibrium", parentId: "root", detail: "ΣF = 0", sourceRef: REF },
      { id: "b", label: "Components", parentId: "a", sourceRef: REF },
    ],
  }),
  "study-guide": base("study-guide", {
    title: "Forces study guide", overview: "Forces cancel at equilibrium.",
    sections: [{ heading: "Equilibrium", body: "The vector sum is zero.", sourceRefs: [REF] }],
    keyTerms: [{ term: "Equilibrium", definition: "ΣF = 0", sourceRef: REF }],
  }),
  practice: base("practice", {
    cards: [{ front: "What is equilibrium?", back: "ΣF = 0", concept: "Equilibrium", sourceRef: REF, sourceDocumentId: "doc-1", sourcePage: 1, sourceExcerpt: "ΣF = 0" }],
    questions: [{ concept: "Equilibrium", prompt: "Vector sum at rest?", choices: [{ id: "a", text: "Zero" }, { id: "b", text: "Weight" }], correctChoice: "a", explanation: "Forces cancel.", sourceRef: REF, sourceDocumentId: "doc-1", sourcePage: 1, sourceExcerpt: "ΣF = 0" }],
  }),
};

async function mockStudio(page: Page) {
  const imports: Array<{ cards: number[]; questions: number[] }> = [];
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/studio/generate", async (route) => {
    const input = route.request().postDataJSON() as { kind: string };
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(fixtures[input.kind]) });
  });
  await page.route("**/api/studio/import", async (route) => {
    imports.push(route.request().postDataJSON() as { cards: number[]; questions: number[] });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cardsAdded: 1, questionsAdded: 1, errors: [] }) });
  });
  return imports;
}

test("Studio shows a plain reason and keeps retry available when the model returns no JSON", async ({ page }) => {
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  let attempts = 0;
  await page.route("**/api/studio/generate", (route) => {
    attempts += 1;
    if (attempts === 1) {
      return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "The model did not return a JSON object." }) });
    }
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(fixtures["study-guide"]) });
  });
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);

  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("studio-tab-study-guide").click();

  const error = page.getByTestId("studio-error");
  await expect(error).toContainText("couldn't turn this lesson");
  await expect(error).not.toContainText("did not return a JSON object");
  await expect(error).toBeVisible();
  await page.screenshot({ path: "test-results/shots/studio-error-after.png" });

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("studio-error")).toHaveCount(0);
  await expect(page.getByTestId("study-guide")).toBeVisible();
  expect(attempts).toBe(2);
});

test("Studio generates a grounded mind map, guide and practice in the new UI", async ({ page }) => {
  const imports = await mockStudio(page);
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);

  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible();
  await page.getByText("Advanced").first().click();
  await page.getByTestId("studio-focus").fill("forces and equilibrium");

  // Mind map: real ReactFlow nodes, branch collapse, concept inspector, source navigation.
  await page.getByTestId("studio-tab-mind-map").click();
  await expect(page.getByTestId("mind-map")).toBeVisible();
  await expect(page.getByTestId("mind-map-node")).toHaveCount(3);
  await page.locator(".studio-map-node").filter({ hasText: "Forces" }).getByRole("button", { name: "Collapse branch" }).click();
  await expect(page.getByTestId("mind-map-node")).toHaveCount(1);
  await page.locator(".studio-map-node").filter({ hasText: "Forces" }).getByRole("button", { name: "Expand branch" }).click();
  await page.locator(".studio-map-node").filter({ hasText: "Equilibrium" }).first().click();
  await expect(page.locator(".studio-map-inspector h4")).toHaveText("Equilibrium");
  await page.getByRole("button", { name: /Open source/ }).click();
  await expect(page.getByTestId("studio-surface")).toHaveCount(0);

  // Study guide: grounded sections render with citations.
  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("studio-tab-study-guide").click();
  await expect(page.getByTestId("study-guide")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Equilibrium" })).toBeVisible();
  await expect(page.locator(".studio-citations button").first()).toBeVisible();

  // Practice: import goes to the existing learning endpoints.
  await page.getByTestId("studio-tab-practice").click();
  await expect(page.getByTestId("practice-view")).toBeVisible();
  await expect(page.getByText("What is equilibrium?")).toBeVisible();
  await page.getByTestId("import-practice").click();
  await expect(page.getByRole("status")).toContainText("1 cards and 1 questions added");
  expect(imports).toEqual([{ artifactId: "art-practice", cards: [0], questions: [0] }]);
});

test("Studio offers a one-click route and a guided direction route", async ({ page }) => {
  const requests: Array<{ kind: string; direction?: string }> = [];
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/studio/generate", async (route) => {
    const input = route.request().postDataJSON() as { kind: string; direction?: string };
    requests.push(input);
    const fixture = fixtures[input.kind] as Record<string, unknown>;
    await route.fulfill({
      status: 201, contentType: "application/json",
      body: JSON.stringify({
        ...fixture, id: `art-${requests.length}`,
        prompt: input.direction ? `Direction from you: ${input.direction}` : "Standard preset; no extra direction.",
      }),
    });
  });
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);

  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible();

  // Quick route: the Create button generates immediately with no direction.
  await page.getByTestId("studio-tab-study-guide").click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].direction).toBeUndefined();

  // Guided route: a chevron, a type, a short direction, and one explicit generate.
  await page.locator(".studio-direct summary").click();
  await page.getByTestId("studio-direct-kind").selectOption("practice");
  await expect(page.getByTestId("studio-direct-practice")).toBeVisible();
  await page.getByTestId("studio-direct-practice").selectOption("quiz");
  await page.getByTestId("studio-direction").fill("Explain it like I'm new to physics");
  await expect(page.getByTestId("studio-generate-directed")).toBeEnabled();
  await page.getByTestId("studio-generate-directed").click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ kind: "practice", direction: "Explain it like I'm new to physics" });

  await page.getByText("Prompt used").click();
  await expect(page.getByTestId("artifact-prompt")).toContainText("Explain it like I'm new to physics");
});
