import { describe, expect, it } from "vitest";
import { parseSourceReference } from "../src/components/document-intelligence/api.js";
import { courseSummary, indexingText } from "../src/today/DailySurfaces.js";

describe("first-60-seconds course summary", () => {
  it("builds verbatim, openable summary points from the first unit of each source", () => {
    const points = courseSummary([
      { id: "doc-1", title: "CHEM 120 notes", filename: "chem.txt", units: [{ type: "text", number: 1, text: "  DNA lives in the nucleus.  " }] },
      { id: "doc-2", title: "Slides", filename: "slides.pptx", units: [{ type: "slide", number: 4, text: "Energy is stored in bonds." }] },
    ]);

    expect(points).toHaveLength(2);
    expect(points[0].excerpt).toBe("DNA lives in the nucleus.");
    expect(points[0].title).toBe("CHEM 120 notes");
    expect(parseSourceReference(points[0].sourceRef)).toMatchObject({ documentId: "doc-1", unitType: "text", unitNumber: 1, chunkIndex: 0 });
    expect(parseSourceReference(points[1].sourceRef)).toMatchObject({ documentId: "doc-2", unitType: "slide", unitNumber: 4 });
  });

  it("skips sources with no indexed text and caps the summary at three points", () => {
    const points = courseSummary([
      { id: "a", title: "Empty", filename: "a.txt", units: [{ type: "text", number: 1, text: "   " }] },
      ...["b", "c", "d", "e"].map((id) => ({ id, title: id, filename: `${id}.txt`, units: [{ type: "text" as const, number: 1, text: `Excerpt ${id}.` }] })),
    ]);
    expect(points.map((point) => point.excerpt)).toEqual(["Excerpt b.", "Excerpt c.", "Excerpt d."]);
  });
});

describe("indexing progress", () => {
  it("names each stage honestly", () => {
    expect(indexingText([{ chunkCount: 4 }, { chunkCount: 8 }], 0, 0)).toBe("2 sources indexed · 12 passages");
    expect(indexingText([{ chunkCount: 4 }], 2, 1)).toBe("Indexing 1 of 2 sources…");
    expect(indexingText([], 0, 0)).toBe("No sources indexed yet");
  });
});
