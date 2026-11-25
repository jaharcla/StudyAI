import { expect, test, type Locator, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

async function ratioOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const parse = (value: string) => {
      const match = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/.exec(value);
      if (!match) return null;
      return { r: +match[1], g: +match[2], b: +match[3], a: match[4] === undefined ? 1 : +match[4] };
    };
    const luminance = (color: { r: number; g: number; b: number }) => {
      const linear = (channel: number) => {
        const scaled = channel / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
    };
    const background = (node: Element | null): { r: number; g: number; b: number } => {
      while (node) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if (color && color.a > 0.75) return color;
        node = node.parentElement;
      }
      return { r: 255, g: 255, b: 255 };
    };
    const text = parse(getComputedStyle(element).color)!;
    const surface = background(element);
    const a = luminance(text);
    const b = luminance(surface);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

async function focusName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return "";
    return active.getAttribute("aria-label") || active.getAttribute("title") || active.textContent?.trim() || "";
  });
}

test("keyboard-only shell traversal has visible focus, logical order and real hit targets", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course } = await createCourseWithLesson(request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.locator(".canvas-board")).toBeVisible();

  const hiddenFocusable = await page.evaluate(() => Array.from(document.querySelectorAll("select[aria-label='Active lesson'],.lesson-header button")).map((element) => (element as HTMLElement).tabIndex));
  expect(hiddenFocusable.every((tabIndex) => tabIndex === -1)).toBe(true);

  await page.keyboard.press("Tab");
  await expect(page.locator(".topbar .breadcrumbs button")).toBeFocused();
  const ring = await page.locator(".topbar .breadcrumbs button").evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(ring.style).toBe("solid");
  expect(ring.width).toBeGreaterThanOrEqual(2);

  const names: string[] = [];
  for (let index = 0; index < 14; index += 1) {
    names.push(await focusName(page));
    await page.keyboard.press("Tab");
  }
  expect(names).toEqual(expect.arrayContaining(["Toggle courses", "Open StudyAI Studio", "Open quizzes and flashcards", "Toggle theme", "Help", "Settings"]));
  expect(names).not.toContain("Open Artifacts");
  expect(names).not.toContain("Open Library");
  expect(names.some((name) => name === "Active lesson")).toBe(false);

  const topbarTargets = await page.locator(".topbar button").evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return Math.min(box.width, box.height);
  }));
  expect(topbarTargets.every((size) => size >= 44)).toBe(true);
  const canvasActions = await page.locator(".canvas-actions .icon-button").evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return Math.min(box.width, box.height);
  }));
  expect(canvasActions.every((size) => size >= 44)).toBe(true);

  await expect(page.getByRole("button", { name: "Analyze board" })).toHaveCount(1);
  const toolNames = await page.locator(".palette-tool").evaluateAll((buttons) => buttons.map((button) => ({ labelled: button.getAttribute("aria-label") ?? button.lastElementChild?.textContent?.trim(), visible: button.lastElementChild?.textContent?.trim() })));
  expect(toolNames.length).toBeGreaterThan(5);
  expect(toolNames.every((tool) => tool.labelled === tool.visible)).toBe(true);
});

test("contrast-critical text clears 4.5:1 in light and dark themes", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course } = await createCourseWithLesson(request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.locator(".canvas-board")).toBeVisible();

  expect(await ratioOf(page.locator(".breadcrumbs > span").first())).toBeGreaterThanOrEqual(4.5);
  expect(await ratioOf(page.locator(".palette-tool-icon > span").first())).toBeGreaterThanOrEqual(4.5);
  await page.getByTitle("Toggle courses").click();
  expect(await ratioOf(page.locator(".tree-sub").last())).toBeGreaterThanOrEqual(4.5);
  await page.locator(".sidebar-scrim").click();

  await page.getByTitle("Toggle theme").click();
  expect(await ratioOf(page.locator(".breadcrumbs b").first())).toBeGreaterThanOrEqual(4.5);
  expect(await ratioOf(page.locator(".breadcrumbs > span").first())).toBeGreaterThanOrEqual(4.5);
  expect(await ratioOf(page.locator(".palette-heading span").first())).toBeGreaterThanOrEqual(4.5);
  expect(await ratioOf(page.locator(".tutor-title small").first())).toBeGreaterThanOrEqual(4.5);
  expect(await ratioOf(page.locator(".palette-tool-icon > span").first())).toBeGreaterThanOrEqual(4.5);
});

test("dialogs are labelled, trap focus, dismiss with Escape and restore focus", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course } = await createCourseWithLesson(request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.locator(".canvas-board")).toBeVisible();

  const settingsTrigger = page.getByTitle("Settings");
  await settingsTrigger.click();
  const settings = page.getByRole("dialog", { name: "StudyAI settings" });
  await expect(settings).toBeVisible();
  await expect(settings).toHaveAttribute("aria-modal", "true");
  await expect(settings.getByRole("button", { name: "Close settings" })).toBeVisible();
  await expect(settings.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await expect(settingsTrigger).toBeFocused();

  await page.getByRole("button", { name: "Notes", exact: true }).click();
  const notes = page.getByRole("dialog", { name: "Lesson notes" });
  await expect(notes).toHaveAttribute("aria-modal", "true");
  await expect(notes.getByRole("button", { name: "Close notes" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(notes).toHaveCount(0);

  await page.getByRole("button", { name: "Chemistry", exact: true }).click();
  const science = page.getByRole("dialog", { name: "Scientific tools" });
  await expect(science).toHaveAttribute("aria-modal", "true");
  await expect(science.getByRole("button", { name: "Close scientific tools" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(science).toHaveCount(0);

  await page.getByTitle("Toggle courses").click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar-scrim")).toHaveCount(0);
});

test("canvas narration controls stay clear of the floating toolbar", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course } = await createCourseWithLesson(request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.locator(".canvas-board")).toBeVisible();

  const narration = page.getByTestId("narration-open");
  await expect(narration).toBeDisabled();
  await page.getByRole("button", { name: "Force", exact: true }).click();
  const board = (await page.locator(".canvas-board").boundingBox())!;
  await page.mouse.move(board.x + board.width / 2, board.y + board.height / 2);
  await page.mouse.down();
  await page.mouse.move(board.x + board.width / 2 + 90, board.y + board.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(narration).toBeEnabled();
  const hit = await narration.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { size: Math.min(box.width, box.height), clear: top === element || element.contains(top) };
  });
  expect(hit.size).toBeGreaterThanOrEqual(44);
  expect(hit.clear).toBe(true);

  await narration.click();
  const progress = await page.locator(".narration-progress button").first().boundingBox();
  expect(progress?.height).toBeGreaterThanOrEqual(44);
  expect(await ratioOf(page.locator(".narration-panel footer"))).toBeGreaterThanOrEqual(4.5);
});

test("reduced motion keeps state without animation", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const { course } = await createCourseWithLesson(request);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.addInitScript((id) => localStorage.setItem("studyai.course", id), course.id);
  await page.goto("/");
  await expect(page.locator(".canvas-board")).toBeVisible();
  await page.getByTitle("Toggle courses").click();
  const motion = await page.evaluate(() => {
    const sidebar = getComputedStyle(document.querySelector(".sidebar")!);
    const scrim = getComputedStyle(document.querySelector(".sidebar-scrim")!);
    const coach = document.querySelector(".coach-dock");
    return { sidebar: sidebar.transitionDuration, scrim: scrim.animationDuration, coach: coach ? getComputedStyle(coach).animationDuration : "0s" };
  });
  expect(motion.sidebar).toBe("0s");
  expect(motion.scrim).toBe("0s");
  expect(motion.coach).toBe("0s");
  await context.close();
});
