import { describe, expect, it } from "vitest";
import { parseCanvasCitation } from "../src/canvas/citation-focus.js";

describe("parseCanvasCitation", () => {
  it("accepts the two canvas scopes Tutor emits", () => {
    expect(parseCanvasCitation("science:mol-42")).toEqual({ scope: "science", id: "mol-42" });
    expect(parseCanvasCitation("quickdraw:shape:xyz-1")).toEqual({ scope: "quickdraw", id: "shape:xyz-1" });
  });

  it("rejects document refs and junk instead of focusing the wrong thing", () => {
    expect(parseCanvasCitation("studyai://document/abc/page/1?chunk=0")).toBeUndefined();
    expect(parseCanvasCitation("science:")).toBeUndefined();
    expect(parseCanvasCitation("science:<script>alert(1)</script>")).toBeUndefined();
    expect(parseCanvasCitation("canvas:science:abc")).toBeUndefined();
  });
});
