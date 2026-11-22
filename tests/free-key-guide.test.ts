import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import FreeKeyGuide from "../src/FreeKeyGuide";

describe("FreeKeyGuide", () => {
  const html = renderToStaticMarkup(createElement(FreeKeyGuide));

  it("renders its four test ids", () => {
    for (const id of ["free-key-guide", "free-key-groq", "free-key-gemini", "free-key-config-link"]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
  });

  it("is guidance only — no input for a key", () => {
    expect(html).not.toContain("<input");
    expect(html).toContain("GROQ_API_KEY=gsk_...");
    expect(html).toContain("GOOGLE_AI_API_KEY=...");
  });

  it("has safe external links", () => {
    expect(html).toContain('href="https://console.groq.com"');
    expect(html).toContain('href="https://aistudio.google.com/apikey"');
    expect(html.match(/rel="noreferrer noopener"/g)).toHaveLength(2);
  });

  it("starts collapsed and links to a real config file", () => {
    expect(html.match(/<details(?! open)/g)).toHaveLength(2);
    expect(html).toContain('href="docs/CONFIGURATION.md"');
    expect(existsSync("docs/CONFIGURATION.md")).toBe(true);
  });
});
