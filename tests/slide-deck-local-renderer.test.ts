import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { renderLocalDeck } from "../server/presentations/local-renderer";
import type { PresentonGenerateRequest } from "../server/presentations/compile";
import { extractDocument } from "../server/document-intelligence/extract";

const request: PresentonGenerateRequest = {
  content: "",
  slides_markdown: [
    "# Forces",
    "- Forces cancel at equilibrium.\n> Source: page 1\n> Notes: Explain the sum.",
  ],
  n_slides: 2,
  template: "general",
  language: "English",
  export_as: "pptx",
  include_title_slide: false,
};

describe("renderLocalDeck", () => {
  it("writes an editable PPTX with real slide text and no network dependency", async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "studyai-local-deck-"));
    const rendered = await renderLocalDeck(request, { outputDir });
    expect(rendered.pptxPath).toMatch(/\.pptx$/);
    expect(rendered.editPath).toBe("");

    const bytes = await readFile(path.join(outputDir, rendered.pptxPath));
    const zip = new AdmZip(bytes);
    const names = zip.getEntries().map((entry) => entry.entryName);
    expect(names).toContain("[Content_Types].xml");
    expect(names).toContain("ppt/presentation.xml");
    expect(names).toContain("ppt/slides/slide1.xml");
    expect(names).toContain("ppt/slides/slide2.xml");

    const slide = zip.readAsText("ppt/slides/slide2.xml");
    expect(slide).toMatch(/<a:t[\s>]/);
    expect(slide).toContain("Forces cancel at equilibrium.");
    expect(slide).toContain("&gt; Source: page 1");
    expect(slide).not.toContain("<w:background>");
  });

  it("produces text that the document extractor reads back with intact source lines", async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "studyai-local-deck-"));
    const rendered = await renderLocalDeck(request, { outputDir });
    const bytes = await readFile(path.join(outputDir, rendered.pptxPath));
    const document = await extractDocument("deck.pptx", new Uint8Array(bytes));
    expect(document.units).toHaveLength(2);
    expect(document.units[1].text).toContain("> Source: page 1");
    expect(document.units[1].text).toContain("Forces cancel at equilibrium.");
  });

  it("escapes XML metacharacters from course text without changing the claim", async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "studyai-local-deck-"));
    const tricky = { ...request, slides_markdown: ["# Forces\n- A < B & C > D\n> Source: page 1"] };
    const rendered = await renderLocalDeck(tricky, { outputDir });
    const bytes = await readFile(path.join(outputDir, rendered.pptxPath));
    const document = await extractDocument("deck.pptx", new Uint8Array(bytes));
    expect(document.units[0].text).toContain("A < B & C > D");
  });
});
