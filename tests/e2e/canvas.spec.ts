import { expect, test } from "@playwright/test";

test("canvas creates, calculates, saves, reloads, and separates boards by course", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atomic structure & bonding" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await page.getByRole("button", { name: "Choose canvas board" }).click();
  await page.getByRole("button", { name: "New board" }).click();
  await expect(page.locator(".canvas-object")).toHaveCount(0);

  await page.getByRole("button", { name: "Lewis structure" }).click();
  await expect(page.getByRole("heading", { name: "Carbon dioxide" })).toBeVisible();
  await page.getByRole("button", { name: "Convert with OpenChemLib" }).click();
  await expect(page.getByText("OpenChemLib SMILES: O=C=O")).toBeVisible();
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".canvas-object").getByText("3 atoms · 2 bonds · 1 form")).toBeVisible();
  await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 10_000 });

  const boardsResponse = await page.request.get("http://127.0.0.1:8201/api/canvases?course=chem-120&lesson=lesson-03");
  const boards = await boardsResponse.json();
  const board = boards[0];
  const savedResponse = await page.request.get(`http://127.0.0.1:8201/api/canvases/${board.id}`);
  const saved = await savedResponse.json();
  expect(JSON.parse(saved.document).objects[0].kind).toBe("molecule");

  await page.reload();
  await expect(page.locator(".canvas-object").getByText("3 atoms · 2 bonds · 1 form")).toBeVisible();
  await page.getByRole("button", { name: "Choose canvas board" }).click();
  await page.getByRole("button", { name: "New board" }).click();
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toContainText("Board");
  await expect(page.locator(".canvas-object")).toHaveCount(0);

  await page.getByRole("button", { name: "BIOL 130 Cell biology" }).click();
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toContainText("Board 1");
  await expect(page.locator(".canvas-object")).toHaveCount(0);
});
