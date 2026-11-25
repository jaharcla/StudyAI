import { describe, expect, it } from "vitest";
import { buildTutorEvidenceContract, groundingNotice, shouldAttachEvidenceContract } from "../server/tutor-evidence-contract.js";

const evidence = {
  status: "evidence" as const,
  message: "Candidate excerpts found; verify each excerpt before using it as an answer." as const,
  courseId: "course-1",
  results: [],
};

describe("buildTutorEvidenceContract", () => {
  it("freezes sorted unique refs from the retrieved set", () => {
    const contract = buildTutorEvidenceContract({ evidence, dropped: false, sourceRefs: ["b", "a", "b"] });
    expect(contract).toEqual({ version: 1, status: "grounded", sourceRefs: ["a", "b"], sourceCount: 2, courseId: "course-1" });
  });
  it("reports no evidence when retrieval found nothing", () => {
    const contract = buildTutorEvidenceContract({ evidence: null, dropped: false, sourceRefs: [] });
    expect(contract.status).toBe("no-evidence");
    expect(contract.sourceCount).toBe(0);
  });
  it("reports dropped evidence even when a prefetch existed", () => {
    const contract = buildTutorEvidenceContract({ evidence, dropped: true, sourceRefs: ["a"] });
    expect(contract.status).toBe("dropped");
  });
});

describe("groundingNotice", () => {
  it("gives exact notices", () => {
    expect(groundingNotice({ version: 1, status: "grounded", sourceRefs: ["a", "b"], sourceCount: 2, courseId: "c" })).toBe("Course evidence · 2 sources checked");
    expect(groundingNotice({ version: 1, status: "no-evidence", sourceRefs: [], sourceCount: 0, courseId: "c" })).toBe("No course evidence · Not in your course material");
    expect(groundingNotice({ version: 1, status: "dropped", sourceRefs: [], sourceCount: 0, courseId: "c" })).toBe("No course evidence · Course excerpts were dropped to fit context. Ask again to retry.");
  });
});

describe("shouldAttachEvidenceContract", () => {
  it("omits notices for exact output and greetings", () => {
    expect(shouldAttachEvidenceContract(true, false, true, 3)).toBe(false);
    expect(shouldAttachEvidenceContract(false, true, false, 0)).toBe(false);
  });
  it("attaches when prefetched or tool-retrieved refs exist", () => {
    expect(shouldAttachEvidenceContract(false, false, true, 0)).toBe(true);
    expect(shouldAttachEvidenceContract(false, false, false, 1)).toBe(true);
  });
});
