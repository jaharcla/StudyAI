import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

// Reviewable capture of every remastered surface, light and dark, at shipped
// desktop size. Set ARTIFACT_SHOT_DIR to write a before/after set. No pixels are
// asserted here; the coordinator's native critique thread reads these images.
test.use({ viewport: { width: 1440, height: 900 } });

const REF = "studyai://document/doc-1/page/1?chunk=0";
const createdAt = new Date().toISOString();
const guide = {
  id: "art-guide", courseId: "c", lessonId: "l", kind: "study-guide", title: "Forces study guide",
  content: {
    title: "Forces study guide", overview: "At equilibrium the vector sum of every force on an object is zero.",
    sections: [
      { heading: "Equilibrium", body: "The vector sum is zero, so the object does not accelerate. On a slope, the component of gravity down the surface is balanced by friction and the normal force.", sourceRefs: [REF] },
      { heading: "Resolving forces", body: "Choose axes along and perpendicular to the surface, then resolve each force into those two directions before summing.", sourceRefs: [REF] },
    ],
    keyTerms: [
      { term: "Equilibrium", definition: "The net force on an object is zero: ΣF = 0.", sourceRef: REF },
      { term: "Normal force", definition: "The contact force perpendicular to a surface.", sourceRef: REF },
    ],
  },
  sourceRefs: [REF], createdAt, acceptance: "pending",
};
const infographic = {
  id: "art-infographic", courseId: "c", lessonId: "l", kind: "infographic", title: "Forces on a slope",
  content: {
    title: "Forces on a slope", objective: "How gravity and the normal force combine on an inclined plane.",
    diagram: {
      title: "Forces on a slope", surfaceAngleDeg: 20,
      forces: [
        { label: "gravity", components: [0, -9.8] },
        { label: "normal", components: [3.4, 9.2] },
        { label: "friction", components: [-3.3, 0.6] },
      ],
    },
    sourceRefs: [REF],
  },
  sourceRefs: [REF], createdAt, acceptance: "pending",
};

test("capture remastered artifact surfaces in light and dark", async ({ page }) => {
  const dir = process.env.ARTIFACT_SHOT_DIR ?? "test-results/artifact-ui";
  mkdirSync(dir, { recursive: true });
  await page.route("**/api/studio/artifacts**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([guide, infographic]) }));
  await page.route("**/api/studio/generate", (route) => {
    const { kind } = route.request().postDataJSON() as { kind: string };
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(kind === "infographic" ? infographic : guide) });
  });

  const { course } = await createCourseWithLesson(page.request);
  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    if (theme === "dark") await page.getByTitle("Toggle theme").click();
    await selectCourseOnPage(page, course.title);
    await page.getByTitle("Open StudyAI Studio").click();
    await expect(page.getByTestId("studio-surface")).toBeVisible();

    await page.screenshot({ path: `${dir}/0${theme === "light" ? "1" : "4"}-list-${theme}.png`, fullPage: true });

    await page.getByTestId("artifact-list-item").filter({ hasText: "Forces study guide" }).click();
    await expect(page.getByTestId("study-guide")).toBeVisible();
    await page.screenshot({ path: `${dir}/0${theme === "light" ? "2" : "5"}-study-guide-${theme}.png`, fullPage: true });

    await page.getByTestId("studio-tab-infographic").click();
    await expect(page.getByTestId("infographic")).toBeVisible();
    await page.screenshot({ path: `${dir}/0${theme === "light" ? "3" : "6"}-infographic-${theme}.png`, fullPage: true });
  }
});
