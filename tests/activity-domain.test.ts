import { describe, expect, it } from "vitest";
import { chooseActivityDomain } from "../src/learning/activities/domain";

describe("chooseActivityDomain", () => {
  it("returns force for force keywords", () => {
    expect(chooseActivityDomain("net force acceleration vector")).toBe("force");
  });
  it("returns graph for graph keywords", () => {
    expect(chooseActivityDomain("slope linear graph")).toBe("graph");
  });
  it("returns null for unrelated text", () => {
    expect(chooseActivityDomain("photosynthesis chlorophyll")).toBeNull();
  });
});