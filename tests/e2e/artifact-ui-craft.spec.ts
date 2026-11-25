import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

const REF = "studyai://document/doc-1/page/1?chunk=0";
const createdAt = new Date().toISOString();
const guide = {
  id: "art-guide", courseId: "c", lessonId: "l", kind: "study-guide", title: "Forces study guide",
  content: {
    title: "Forces study guide", overview: "At equilibrium the vector sum of every force is zero.",
    sections: [{ heading: "Equilibrium", body: "The vector sum is zero, so the object does not accelerate.", sourceRefs: [REF] }],
    keyTerms: [{ term: "Equilibrium", definition: "ΣF = 0", sourceRef: REF }],
  },
  sourceRefs: [REF], createdAt, acceptance: "pending",
};
const infographic = {
  id: "art-infographic", courseId: "c", lessonId: "l", kind: "infographic", title: "Forces on a slope",
  content: {
    title: "Forces on a slope", objective: "How forces combine on an inclined plane.",
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

async function enterStudio(page: Page, dark = false) {
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/");
  if (dark) await page.getByTitle("Toggle theme").click();
  await selectCourseOnPage(page, course.title);
  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible();
}

test("library uses grounded labels, keyboard focus and a designed empty state", async ({ page }) => {
  await page.route("**/api/studio/artifacts**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([guide, infographic]) }));
  await enterStudio(page);

  // Human-readable kinds, never the internal enum strings.
  const list = page.getByTestId("artifact-list");
  await expect(list).toContainText("Study guide");
  await expect(list).toContainText("Infographic");
  await expect(list).not.toContainText("study-guide");

  // Filter to a kind with no artifacts: designed empty state, not a blank list.
  await page.getByTestId("artifact-filter-practice").click();
  await expect(page.getByTestId("artifact-list-empty")).toBeVisible();
  await expect(page.getByTestId("artifact-list-item")).toHaveCount(0);
  await page.getByTestId("artifact-filter-all").click();

  // Keyboard modality produces a designed focus ring on the next control.
  await page.getByTestId("studio-focus").focus();
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return { outline: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth };
  });
  expect(focus.outline).toBe("solid");
  expect(parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
});

test("guide and infographic use authored hierarchy, caption, credit and grounded citations", async ({ page }) => {
  await page.route("**/api/studio/artifacts**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([guide, infographic]) }));
  await page.route("**/api/studio/generate", (route) => {
    const { kind } = route.request().postDataJSON() as { kind: string };
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(kind === "infographic" ? infographic : guide) });
  });
  await enterStudio(page);

  await page.getByTestId("artifact-list-item").filter({ hasText: "Forces study guide" }).click();
  const guideView = page.getByTestId("study-guide");
  await expect(guideView).toBeVisible();
  await expect(guideView.locator(".studio-doc-title")).toHaveText("Forces study guide");
  await expect(guideView.locator(".studio-lead")).toContainText("vector sum");
  // No kicker above the heading, and no nested card containers.
  await expect(page.locator(".studio-eyebrow")).toHaveCount(0);
  await expect(guideView.locator(".studio-guide-terms div[class*='card']")).toHaveCount(0);
  await expect(guideView.getByTestId("citation-chip")).toHaveText(["page 1", "page 1"]);

  await page.getByTestId("studio-tab-infographic").click();
  const figure = page.getByTestId("infographic");
  await expect(figure).toBeVisible();
  await expect(page.locator(".studio-eyebrow")).toHaveCount(0);
  await expect(page.getByTestId("infographic-caption")).toContainText("Figure");
  await expect(page.getByTestId("infographic-caption")).toContainText("Drawn locally from the lesson diagram");
  await expect(page.getByTestId("infographic-svg")).toHaveAttribute("aria-label", /gravity.*normal/);
  await expect(page.locator(".studio-figure-values dd").first()).toHaveCSS("font-variant-numeric", "tabular-nums");
  await expect(figure.getByTestId("citation-chip")).toHaveText("page 1");
});

test("loading, error and success states are real and recoverable", async ({ page }) => {
  let generateCalls = 0;
  await page.route("**/api/studio/artifacts**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }));
  await enterStudio(page);

  // Empty artifact library gets a designed first-run state.
  await expect(page.getByTestId("studio-empty")).toBeVisible();
  await expect(page.getByTestId("studio-empty")).toContainText("Each item keeps a citation");

  await page.route("**/api/studio/generate", async (route) => {
    generateCalls += 1;
    if (generateCalls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(guide) });
      return;
    }
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Model service unavailable." }) });
  });

  await page.getByTestId("studio-tab-study-guide").click();
  await expect(page.getByTestId("studio-loading")).toBeVisible();
  await expect(page.getByTestId("studio-loading")).toContainText("Reading this lesson's sources");
  await expect(page.getByTestId("studio-loading")).toHaveAttribute("role", "status");
  await expect(page.getByTestId("studio-loading")).toBeHidden();
  await expect(page.getByTestId("artifact-kind")).toHaveText("Study guide");

  // Failure names the problem and offers a recovery action.
  await page.getByTestId("studio-tab-study-guide").click();
  await expect(page.getByTestId("studio-error")).toBeVisible();
  // The UI deliberately hides the raw provider string and shows an honest, recoverable message.
  await expect(page.getByTestId("studio-error")).toContainText("Generation didn't complete.");
  await expect(page.getByTestId("studio-error")).not.toContainText("Model service unavailable.");
  await expect(page.getByTestId("studio-error").getByRole("button", { name: "Try again" })).toBeVisible();
});

test("accept is announced and dark mode is a complete second theme", async ({ page }) => {
  await page.route("**/api/studio/artifacts**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([guide]) }));
  await page.route("**/api/studio/accept", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...guide, acceptance: "accept" }) }));
  await enterStudio(page, true);

  const surface = page.getByTestId("studio-surface");
  const darkBg = await surface.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(darkBg).toBe("rgb(27, 31, 37)");

  await page.getByTestId("artifact-list-item").filter({ hasText: "Forces study guide" }).click();
  await page.getByTestId("artifact-accept").click();
  await expect(page.getByTestId("artifact-status")).toHaveAttribute("aria-live", "polite");
  await expect(page.getByTestId("artifact-acceptance")).toHaveText("Accepted");
  await expect(page.getByTestId("artifact-accept")).toBeDisabled();
});
