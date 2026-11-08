import { expect, test } from "@playwright/test";
import { pdfFixture } from "../fixtures/document-intelligence.js";

const dataApi = "http://127.0.0.1:8201/api";

test("imports a PDF, retrieves its fact in the tutor, and opens its page citation", async ({ page, request }) => {
  test.setTimeout(240_000);
  await expect.poll(async () => (await request.get(dataApi + "/courses")).status(), { timeout: 30_000 }).toBe(200);
  await expect.poll(async () => (await request.get("http://127.0.0.1:8200/api/copilotkit/info")).status(), { timeout: 30_000 }).toBe(200);
  await expect.poll(async () => (await request.get("http://127.0.0.1:8123/ok")).status(), { timeout: 30_000 }).toBe(200);
  await page.goto("/");
  await page.getByRole("button", { name: "Lecture", exact: true }).click();

  const input = page.locator(".di-file-input");
  await input.setInputFiles({ name: "citation-proof.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdfFixture("The assigned alloy code is ZORBIUM-417.")) });
  await expect(page.getByText("Indexed", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => {
    const response = await request.get(dataApi + "/document-intelligence/search?course=chem-120&q=ZORBIUM-417");
    const body = await response.json();
    return Boolean(body.results?.[0]);
  }, { timeout: 30_000 }).toBe(true);
  const searchResponse = await request.get(dataApi + "/document-intelligence/search?course=chem-120&q=ZORBIUM-417");
  const hit = (await searchResponse.json()).results[0] as { documentId: string; filename: string; unitType: string; unitNumber: number; sourceRef: string };

  try {
    expect(hit.filename).toBe("citation-proof.pdf");
    expect(hit.unitType).toBe("page");
    expect(hit.unitNumber).toBe(1);
    const chat = page.getByTestId("copilot-chat-textarea");
    await chat.fill("According to my imported lecture, what is the assigned alloy code? Separate sourced information from general knowledge and cite the page.");
    await chat.press("Enter");
    await expect(page.getByText("ZORBIUM-417", { exact: false }).last()).toBeVisible({ timeout: 180_000 });
    const citation = page.locator('a[href^="#studyai-citation="]').filter({ hasText: "citation-proof.pdf" }).last();
    await expect(citation).toBeVisible({ timeout: 30_000 });
    await expect(citation).toContainText("page 1");
    await citation.click();
    await expect(page.getByRole("dialog", { name: "citation-proof.pdf" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Page 1 of 1")).toBeVisible();
  } finally {
    await request.delete(dataApi + "/document-intelligence/documents/" + encodeURIComponent(hit.documentId) + "?course=chem-120").catch(() => undefined);
  }
});
