import { describe, expect, it } from "vitest";
import { parseArtifactPackage } from "../src/artifacts/package";
import { reviewProvenance } from "../src/artifacts/provenance";
import { emptyCanvasDocument, parseCanvasDocument, type ScientificObject } from "../src/canvas/model";

const REF = "studyai://document/module-1/text/4?chunk=0";
const chunks = [{ ref: REF, text: "Friction opposes the motion down the slope." }];

const pkgWithClaims = (claims: Array<Record<string, unknown>>) => parseArtifactPackage({
  schemaVersion: 1,
  id: "prov-pkg",
  objective: "Friction",
  courseId: "c1",
  lessonId: "l1",
  components: [{ id: "e1", kind: "explanation", text: "Friction opposes motion.", sourceRefs: [REF], claims }],
}, [REF]);

const claim = (text: string, relationship: "direct" | "interpretation" | "extension" | "unresolved-conflict") => ({
  claim: text, sourceRef: REF, excerpt: text, relationship,
});

describe("reviewProvenance", () => {
  it("verifies a direct claim whose excerpt is contained in the retrieved chunk", () => {
    const reviews = reviewProvenance(pkgWithClaims([claim("Friction opposes the motion", "direct")]), chunks);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.outcome).toBe("verified");
    expect(reviews[0]?.relationship).toBe("direct");
  });

  it("downgrades a direct claim with no containment to needs-review", () => {
    const reviews = reviewProvenance(pkgWithClaims([claim("Friction always acts uphill", "direct")]), chunks);
    expect(reviews[0]?.outcome).toBe("needs-review");
    expect(reviews[0]?.reason).toMatch(/containment/i);
  });

  it("labels interpretations and extensions as needs-review", () => {
    const reviews = reviewProvenance(pkgWithClaims([
      claim("This illustrates the general principle", "interpretation"),
      claim("It also applies to inclined planes", "extension"),
    ]), chunks);
    expect(reviews.map((review) => review.relationship)).toEqual(["interpretation", "extension"]);
    expect(reviews.every((review) => review.outcome === "needs-review")).toBe(true);
  });

  it("blocks an unresolved conflict from being presented as course fact", () => {
    const reviews = reviewProvenance(pkgWithClaims([
      claim("The notes disagree here", "unresolved-conflict"),
    ]), chunks);
    expect(reviews[0]?.outcome).toBe("needs-review");
    expect(reviews[0]?.reason).toMatch(/conflict/i);
  });

  it("loads a pre-change document with no claims and an additive-claims document at version 1", () => {
    const oldObject: ScientificObject = { id: "q-legacy", kind: "question", x: 0, y: 0, width: 100, height: 50, prompt: "Legacy?" };
    const parsedOld = parseCanvasDocument({ ...emptyCanvasDocument(), objects: [oldObject] });
    expect(parsedOld.version).toBe(1);
    const withClaims: ScientificObject = {
      ...oldObject, id: "q-claims",
      provenance: { status: "generated-unverified", sourceRefs: [REF], claims: [claim("Friction opposes the motion", "direct")] },
    };
    const parsedClaims = parseCanvasDocument({ ...emptyCanvasDocument(), objects: [withClaims] });
    expect(parsedClaims.version).toBe(1);
    expect(parsedClaims.objects[0]?.provenance?.claims).toHaveLength(1);
  });
});
