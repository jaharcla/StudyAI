import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.setTimeout(120000);
test.use({ viewport: { width: 1440, height: 900 } });

async function openCourse(page: Page, title: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
}

test("shared chrome gives every surface one header with back and close", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion ${Date.now()}`, "Cohesion lesson");
  await openCourse(page, course.title);

  const surfaces = [
    { open: () => page.getByTitle("Open StudyAI Studio").click(), dialog: "StudyAI Studio", eyebrow: "Studio", title: "StudyAI Studio", back: "Back to workspace", close: "Close Studio" },
    { open: () => page.getByTitle("Open Artifacts").click(), dialog: "Artifacts", eyebrow: "Artifacts", title: "Artifacts", back: "Back to workspace", close: "Close artifacts" },
    { open: () => page.getByTestId("open-concept-graph").click(), dialog: "Course concept graph", eyebrow: "Concepts", title: "Concept graph", back: "Back to workspace", close: "Close concept graph" },
    { open: () => page.getByRole("button", { name: "Study", exact: true }).click(), dialog: "Study session", eyebrow: "Study", title: "Study tutor", back: "Back to canvas", close: "Close study session" },
  ];

  for (const surface of surfaces) {
    await surface.open();
    const dialog = page.getByRole("dialog", { name: surface.dialog });
    await expect(dialog).toBeVisible();
    const header = dialog.locator(".surface-header");
    await expect(header).toHaveCount(1);
    await expect(header.locator(".surface-eyebrow")).toHaveText(surface.eyebrow);
    await expect(header.locator(".surface-title")).toHaveText(surface.title);
    await expect(header.getByRole("button", { name: surface.back })).toHaveCount(1);
    await expect(header.getByRole("button", { name: surface.close })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("shared notice uses the status role on artifacts", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion notice ${Date.now()}`, "Cohesion lesson");
  await openCourse(page, course.title);
  await page.getByTitle("Open Artifacts").click();

  const notice = page.locator('[data-testid="artifacts-surface"] .surface-notice');
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute("role", "status");
  await expect(notice).toHaveAttribute("aria-live", "polite");
  await expect(notice).toHaveAttribute("data-testid", "artifacts-status");
});
