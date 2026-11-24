import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.setTimeout(240_000);

const KINDS = [
  "atom", "bond", "molecule", "equation",
  "vector", "force", "measurement", "graph",
  "anatomy", "concept", "relationship", "linked-note",
  "linked-document", "question", "flashcard", "mindmap",
] as const;

type Kind = (typeof KINDS)[number];

const EVIDENCE = resolve("docs/verification/canvas-visual-remediation");

type SeedObject = Record<string, unknown> & { id: string; kind: Kind; x: number; y: number; width: number; height: number };

function seedObject(kind: Kind, index: number): SeedObject {
  const x = 340 + (index % 3) * 340;
  const y = 120 + Math.floor(index / 3) * 150;
  const base: SeedObject = { id: `seed-${kind}`, kind, x, y, width: 220, height: 110 };
  const geometry = { tail: { x: x - 55, y: y + 10 }, tip: { x: x + 55, y: y - 10 }, unitsPerCanvasUnit: 1 };
  switch (kind) {
    case "atom": return { ...base, element: "O", nonbondingElectrons: 4, bondOrderSum: 2, label: "Oxygen" };
    case "bond": return { ...base, from: "seed-atom", to: "seed-molecule", order: 2, label: "C=O",
      geometry: { ...geometry, tailRef: { scope: "science", id: "seed-atom", u: 1, v: 0.5 } } };
    case "molecule": return { ...base, width: 260, height: 154, name: "Carbon dioxide",
      atoms: [{ id: "mol-o1", element: "O", nonbondingElectrons: 4 }, { id: "mol-c", element: "C", nonbondingElectrons: 0 }, { id: "mol-o2", element: "O", nonbondingElectrons: 4 }],
      resonanceForms: [{ id: "form-1", name: "Form 1", bonds: [{ id: "mol-b1", from: "mol-o1", to: "mol-c", order: 2 }, { id: "mol-b2", from: "mol-c", to: "mol-o2", order: 2 }] }],
      activeResonanceId: "form-1" };
    case "equation": return { ...base, expression: "a^2+b^2", variables: { a: 3, b: 4 }, result: 25, units: "" };
    case "vector": return { ...base, components: [110, 20, 0], units: "N", label: "Vector", geometry };
    case "force": return { ...base, components: [0, 80, 0], units: "N", label: "Force", geometry };
    case "measurement": return { ...base, value: 12, units: "m", label: "Measurement", geometry };
    case "graph": return { ...base, width: 260, height: 180, expression: "x^2", xRange: [-3, 3],
      points: Array.from({ length: 13 }, (_, i) => { const px = -3 + i / 2; return [Number(px.toFixed(3)), Number((px * px).toFixed(3))]; }),
      xLabel: "x", yLabel: "y" };
    case "anatomy": return { ...base, structureId: "heart", system: "Circulatory", labels: ["Atrium", "Ventricle"] };
    case "concept": return { ...base, title: "Mitosis", definition: "Nuclear division producing two identical daughter cells.", conceptId: "bio-mito" };
    case "relationship": return { ...base, fromId: "seed-concept", toId: "seed-anatomy", label: "relates to", geometry };
    case "linked-note": return { ...base, noteId: "note-1", title: "Lecture 4", excerpt: "Notes on atomic bonding." };
    case "linked-document": return { ...base, documentId: "doc-1", title: "Chapter 2", excerpt: "Excerpt from the textbook." };
    case "question": return { ...base, prompt: "What is mitosis?", answer: "Nuclear cell division.", scenario: "In a dividing cell…" };
    case "flashcard": return { ...base, front: "Mitosis", back: "Division of the nucleus." };
    case "mindmap": return { ...base, width: 340, height: 240, title: "Cell biology",
      nodes: [{ id: "n0", label: "Cell", x: 0, y: 0 }, { id: "n1", label: "Nucleus", x: -110, y: 70 }, { id: "n2", label: "Membrane", x: 110, y: 70 }],
      edges: [{ from: "n0", to: "n1", label: "contains" }, { from: "n0", to: "n2" }] };
  }
}

async function seedBoard(request: APIRequestContext, course: { id: string }, lesson: { id: string }) {
  const boards = await (await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`)).json();
  const board = boards[0];
  const row = await (await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`)).json();
  const document = { version: 1, snapshot: { document: { store: {} } }, objects: KINDS.map(seedObject) };
  const saved = await request.post("/api/canvases", { data: {
    id: board.id, courseId: course.id, lessonId: lesson.id, name: board.name,
    document, expectedRevision: row.revision,
  } });
  expect(saved.ok(), await saved.text()).toBe(true);
  return board;
}

async function openSeededBoard(page: Page, title: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await page.reload();
  await selectCourseOnPage(page, title);
  await expect(page.locator('[data-kind="concept"]')).toHaveCount(1);
}

function srgb(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance([r, g, b]: [number, number, number]) {
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function parseColor(value: string): [number, number, number] {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) throw new Error(`Unparseable CSS color: ${value}`);
  const parts = match[1].split(",").map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) throw new Error(`Unparseable CSS color: ${value}`);
  return [parts[0], parts[1], parts[2]];
}
function contrast(a: [number, number, number], b: [number, number, number]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function tool(page: Page, name: string) {
  const opener = page.getByRole("button", { name: "Open canvas tools", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function isolate(page: Page, kind: Kind) {
  await page.evaluate((selected) => {
    document.querySelectorAll("[data-kind]").forEach((element) => {
      (element as HTMLElement).style.opacity = element.getAttribute("data-kind") === selected ? "1" : "0";
    });
  }, kind);
}
async function clearIsolation(page: Page) {
  await page.evaluate(() => document.querySelectorAll("[data-kind]").forEach((element) => { (element as HTMLElement).style.opacity = ""; }));
}

test("baseline captures all sixteen kinds in light and dark", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await seedBoard(request, course, lesson);
  await page.reload();
  await selectCourseOnPage(page, course.title);
  await expect(page.locator('[data-kind="concept"]')).toHaveCount(1);

  // 16 assertions: the baseline cannot silently omit a kind.
  for (const kind of KINDS) await expect(page.locator(`[data-kind="${kind}"]`)).toHaveCount(1);

  if (process.env.CANVAS_CAPTURE === "1") {
    const suffix = process.env.CANVAS_SHOT_SUFFIX ?? "before";
    mkdirSync(EVIDENCE, { recursive: true });
    const viewport = page.locator(".canvas-viewport");
    for (const theme of ["light", "dark"] as const) {
      if (theme === "dark") await page.getByTitle("Toggle theme").click();
      for (const kind of KINDS) {
        await isolate(page, kind);
        await viewport.screenshot({ path: resolve(EVIDENCE, `${kind}-${suffix}${theme === "dark" ? "-dark" : ""}.png`) });
      }
      await clearIsolation(page);
    }
  }
});

test("phase 1 shared tokens render on the actual DOM in light and dark", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await seedBoard(request, course, lesson);
  await openSeededBoard(page, course.title);

  const card = page.locator('[data-kind="concept"] .scene-node');
  await expect(card).toHaveAttribute("data-testid", "card-surface");
  await expect(card).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(card).toHaveCSS("border-radius", "8px");
  await expect(card).toHaveCSS("box-shadow", /0px 4px 16px/);

  const fill = parseColor(await card.evaluate((element) => getComputedStyle(element).backgroundColor));
  const secondary = parseColor(await card.locator("span").evaluate((element) => getComputedStyle(element).color));
  expect(contrast(fill, secondary)).toBeGreaterThanOrEqual(4.5);

  await page.locator('[data-kind="relationship"]').dblclick();
  await expect(page.locator(".canvas-object-editor")).toBeVisible();
  await expect(page.locator(".canvas-object-editor header span")).toHaveCount(0);
  await expect(page.locator(".object-editor-fields h4").first()).toBeVisible();
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();

  for (const kind of ["concept", "anatomy", "atom", "bond", "relationship"] as const) {
    const glyph = page.locator(`[data-kind="${kind}"][role="button"]`).first();
    await expect(glyph).toHaveCount(1);
    await expect(glyph).toHaveAttribute("tabindex", "0");
  }

  await expect(page.locator('[data-kind="bond"] [data-testid="label-chip"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="bond"] text')).toHaveAttribute("text-anchor", "middle");

  await page.getByTitle("Toggle theme").click();
  await expect(card).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(card).toHaveCSS("box-shadow", /0px 4px 16px/);
});

test("captures inspector surfaces for the user-readiness fixes", async ({ page, request }) => {
  if (process.env.CANVAS_CAPTURE !== "1") return;
  const { course, lesson } = await createCourseWithLesson(request);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await seedBoard(request, course, lesson);
  await openSeededBoard(page, course.title);
  mkdirSync(EVIDENCE, { recursive: true });
  const suffix = process.env.CANVAS_SHOT_SUFFIX ?? "before";
  for (const kind of ["bond", "anatomy", "concept", "mindmap", "flashcard"] as const) {
    await page.locator(`[data-kind="${kind}"]`).dblclick();
    await expect(page.locator(".canvas-object-editor")).toBeVisible();
    await page.locator(".canvas-object-editor").screenshot({ path: resolve(EVIDENCE, `inspector-${kind}-${suffix}.png`) });
    await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();
  }
  const flip = page.locator('[data-kind="flashcard"] [data-testid="flip-card"]');
  if (await flip.isVisible()) {
    await flip.click();
    await page.locator('[data-kind="flashcard"] .scene-node').screenshot({ path: resolve(EVIDENCE, `flashcard-revealed-${suffix}.png`) });
  }
});

test("user-readiness fixes: math, recall, maps, human names, units and geometry hold in the DOM", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await seedBoard(request, course, lesson);
  await openSeededBoard(page, course.title);

  // K3 — math is typeset, result token has the pinned treatment.
  const equation = page.locator('[data-kind="equation"]');
  await expect(equation.getByTestId("typeset-math")).toBeVisible();
  expect(await equation.textContent()).not.toMatch(/\^/);
  await expect(equation.locator(".expression-result")).toHaveText(/^=/);
  await expect(equation.locator(".expression-result")).toHaveCSS("color", "rgb(83, 106, 82)");
  await expect(equation.locator(".expression-result")).toHaveCSS("font-size", "14px");
  await expect(equation.locator(".expression-result")).toHaveCSS("font-weight", "600");
  const graph = page.locator('[data-kind="graph"]');
  await expect(graph.getByTestId("typeset-math")).toBeVisible();
  await expect(graph.locator(".graph-surface")).not.toHaveCSS("fill", "rgba(0, 0, 0, 0)");
  await expect(graph.locator(".graph-surface")).toHaveCSS("filter", /drop-shadow/);
  expect(await graph.locator("text").first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(11);

  // K1 — flashcard recall: front first, explicit flip, divider and keyboard.
  const flashcard = page.locator('[data-kind="flashcard"]');
  await expect(flashcard.getByTestId("flashcard-back")).toHaveCount(0);
  await expect(flashcard).toContainText("Mitosis");
  await expect(flashcard.getByTestId("flip-card")).toBeVisible();
  await flashcard.getByTestId("flip-card").click();
  await expect(flashcard.getByTestId("flashcard-back")).toBeVisible();
  await expect(flashcard.getByTestId("flashcard-back")).toContainText("Division of the nucleus.");
  await flashcard.getByTestId("flip-card").focus();
  await page.keyboard.press("Enter");
  await expect(flashcard.getByTestId("flashcard-back")).toHaveCount(0);

  // K2 — mind map renders its title, labelled arrowed edges and an editable panel.
  const mindmap = page.locator('[data-kind="mindmap"]');
  await expect(mindmap.getByTestId("mindmap-title")).toHaveText("Cell biology");
  await expect(mindmap.getByTestId("mindmap-edge-label-0")).toHaveText("contains");
  await expect(mindmap.locator(".mindmap-edge")).toHaveCount(2);
  await expect(mindmap.locator(".mindmap-edge").first()).toHaveAttribute("marker-end", /arrowhead/);
  await expect(mindmap.locator(".mindmap-root-node")).toHaveCount(1);
  await mindmap.dblclick();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Node label 1", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Edge label 1", exact: true })).toBeVisible();
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();

  // K4 — internal identifiers never reach the UI.
  await expect(page.locator('[data-kind="anatomy"] .scene-node strong')).toHaveText("Heart");
  await page.locator('[data-kind="bond"]').dblclick();
  await expect(page.getByRole("combobox", { name: "From atom" })).toHaveCount(1);
  expect(await page.getByRole("combobox", { name: "From atom" }).evaluate((element) => element.tagName)).toBe("SELECT");
  await expect(page.locator(".object-editor-fields input")).not.toHaveValue(/^seed-/);
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();
  await page.locator('[data-kind="concept"]').dblclick();
  await expect(page.getByRole("combobox", { name: "Course concept" })).toHaveCount(1);
  await expect(page.locator('.object-editor-fields input[value="bio-mito"]')).toHaveCount(0);
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();

  // K6 — units survive drag creation, one precision on board and inspector, distinct force stroke.
  for (const kind of ["vector", "force", "measurement"] as const) await expect(page.locator(`[data-kind="${kind}"]`)).not.toContainText("canvas units");
  const vector = page.locator('[data-kind="vector"]').first();
  await expect(vector).toContainText("111.80");
  await vector.locator(".science-hit").dblclick();
  await expect(page.locator(".canvas-object-editor")).toContainText("111.80 N");
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();
  const vectorStroke = await page.locator('[data-kind="vector"] .science-arrow-line').first().evaluate((element) => getComputedStyle(element).stroke);
  const forceStroke = await page.locator('[data-kind="force"] .science-arrow-line').first().evaluate((element) => getComputedStyle(element).stroke);
  expect(forceStroke).not.toBe(vectorStroke);
  await tool(page, "Vector");
  const box = (await page.locator(".canvas-board").boundingBox())!;
  await page.mouse.move(box.x + 520, box.y + 520); await page.mouse.down(); await page.mouse.move(box.x + 600, box.y + 480, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('[data-kind="vector"]')).toHaveCount(2);
  await expect(page.locator('[data-kind="vector"]').last()).not.toContainText("canvas units");

  // K7 — the atom hit region and bond attachment follow the drawn glyph, not the 220x110 box.
  const atom = page.locator('[data-kind="atom"]');
  const hit = (await atom.locator(".scene-object-hit").boundingBox())!;
  expect(hit.width).toBeLessThanOrEqual(48);
  await expect(atom.locator(".molecule-name")).toHaveText("Oxygen");
  const bondLine = page.locator('[data-kind="bond"] .scene-line-stroke').first();
  expect(Math.hypot(Number(await bondLine.getAttribute("x1")) - 340, Number(await bondLine.getAttribute("y1")) - 120)).toBeCloseTo(22, 0);
});
