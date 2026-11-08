import { expect, test } from "@playwright/test";
import { createCourseWithLesson, drawCarbonDioxide, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test("places atoms, connects bonds, edits lone pairs/charges, moves atoms, converts and reloads", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(request);
  await page.goto("/"); await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await page.getByRole("button", { name: "Lewis structure", exact: true }).click();
  await expect(page.locator('[data-kind="molecule"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await drawCarbonDioxide(page);
  await page.getByRole("button", { name: "Convert with OpenChemLib", exact: true }).click();
  await expect(page.getByText("OpenChemLib SMILES: O=C=O", { exact: true })).toBeVisible();
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();
  const molecule = page.locator('[data-kind="molecule"]');
  const atom = molecule.locator('[data-element="O"]').first();
  expect(await atom.getAttribute("data-charge")).toBe("0");
  await atom.locator(".atom-hit").click();
  await page.getByRole("button", { name: "Remove lone pair", exact: true }).click();
  await expect(atom).toHaveAttribute("data-charge", "2");
  await page.getByRole("button", { name: "Add lone pair", exact: true }).click();
  await expect(atom).toHaveAttribute("data-charge", "0");
  const atomId = await atom.getAttribute("data-atom-id");
  await page.getByRole("combobox", { name: "Selected atom element", exact: true }).selectOption("N");
  await expect(page.locator(`[data-atom-id="${atomId}"]`)).toHaveAttribute("data-charge", "-1");
  await page.getByRole("combobox", { name: "Selected atom element", exact: true }).selectOption("O");
  for (const order of [3, 1, 2]) {
    await molecule.locator("[data-bond-id] .science-hit").first().dblclick();
    await expect(molecule.locator("[data-bond-id]").first()).toHaveAttribute("data-order", String(order));
  }
  const bondIds = await molecule.locator("[data-bond-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-bond-id")));
  const old = (await atom.locator(".atom-hit").boundingBox())!;
  await page.mouse.move(old.x + old.width / 2, old.y + old.height / 2); await page.mouse.down(); await page.mouse.move(old.x + old.width / 2 - 35, old.y + old.height / 2 + 45, { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => (await atom.locator(".atom-hit").boundingBox())!.y).toBeCloseTo(old.y + 45, 0);
  expect(await molecule.locator("[data-bond-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-bond-id")))).toEqual(bondIds);
  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved");
  await page.reload();
  await expect(page.locator(`[data-atom-id="${atomId}"]`)).toHaveAttribute("data-charge", "0");
  await expect.poll(async () => (await page.locator(`[data-atom-id="${atomId}"] .atom-hit`).boundingBox())!.y).toBeCloseTo(old.y + 45, 0);
  const boards = await (await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`)).json();
  const saved = await (await request.get(`/api/canvases/${boards[0].id}?course=${course.id}&lesson=${lesson.id}`)).json();
  expect(JSON.parse(saved.document).objects[0].atoms).toHaveLength(3);
  expect(JSON.parse(saved.document).objects[0].resonanceForms[0].bonds.map((bond: { id: string }) => bond.id)).toEqual(bondIds);
});
