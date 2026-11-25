import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

const REF = "studyai://document/doc-1/page/1?chunk=0";
const createdAt = new Date().toISOString();
const guide = {
  id: "art-guide", courseId: "c", lessonId: "l", kind: "study-guide", title: "Forces study guide",
  content: {
    title: "Forces study guide", overview: "Forces cancel at equilibrium.",
    sections: [{ heading: "Equilibrium", body: "The vector sum is zero.", sourceRefs: [REF] }],
    keyTerms: [{ term: "Equilibrium", definition: "ΣF = 0", sourceRef: REF }],
  },
  sourceRefs: [REF], createdAt, acceptance: "pending",
};
const infographic = {
  id: "art-infographic", courseId: "c", lessonId: "l", kind: "infographic", title: "Forces on a slope",
  content: {
    title: "Forces on a slope", objective: "Forces on a slope",
    diagram: {
      title: "Forces on a slope", surfaceAngleDeg: 20,
      forces: [
        { label: "gravity", components: [0, -9.8] },
        { label: "normal", components: [3.4, 9.2] },
      ],
    },
    sourceRefs: [REF],
  },
  sourceRefs: [REF], createdAt, acceptance: "pending",
};

async function mockArtifactStore(page: Page) {
  const decisions: Array<{ id: string; decision: string }> = [];
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([guide, infographic]) }));
  await page.route("**/api/studio/accept", async (route) => {
    const input = route.request().postDataJSON() as { id: string; decision: string };
    decisions.push(input);
    const artifact = input.id === guide.id ? guide : infographic;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...artifact, acceptance: input.decision }) });
  });
  return decisions;
}

test("artifact library: list, filter, open, citation, accept and download a guide or infographic", async ({ page }) => {
  const decisions = await mockArtifactStore(page);
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible();

  // List + filter: both first-class kinds live in the same store.
  await expect(page.getByTestId("artifact-list")).toBeVisible();
  await expect(page.getByTestId("artifact-list-item")).toHaveCount(2);
  await page.getByTestId("artifact-filter-infographic").click();
  await expect(page.getByTestId("artifact-list-item")).toHaveCount(1);
  await page.getByTestId("artifact-filter-all").click();

  // Open a study guide; its citation chip opens the grounded source.
  await page.getByTestId("artifact-list-item").filter({ hasText: "Forces study guide" }).click();
  await expect(page.getByTestId("study-guide")).toBeVisible();
  await expect(page.getByTestId("citation-chip")).toHaveCount(2);
  mkdirSync("test-results/artifact-breadth", { recursive: true });
  await page.screenshot({ path: "test-results/artifact-breadth/study-guide.png", fullPage: true });
  await page.getByTestId("citation-chip").first().click();
  await expect(page.getByTestId("studio-surface")).toHaveCount(0);

  // Open the infographic: deterministic local SVG with accessible labels and arrows.
  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("artifact-list-item").filter({ hasText: "Forces on a slope" }).click();
  await expect(page.getByTestId("infographic")).toBeVisible();
  await expect(page.getByTestId("infographic-svg")).toBeVisible();
  await expect(page.getByTestId("infographic-force")).toHaveCount(2);
  await expect(page.getByTestId("infographic-svg")).toHaveAttribute("aria-label", /gravity.*normal/);
  await page.screenshot({ path: "test-results/artifact-breadth/infographic.png", fullPage: true });

  // One accept transaction per artifact.
  await page.getByTestId("artifact-accept").click();
  await expect(page.getByTestId("artifact-acceptance")).toHaveText("Accepted");
  expect(decisions).toEqual([{ id: infographic.id, decision: "accept" }]);

  // Download is the actual local SVG, not a generated image or a remote render.
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("artifact-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("art-infographic.svg");
});
