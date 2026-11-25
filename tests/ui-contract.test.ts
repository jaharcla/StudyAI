import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { courseIntakeState } from "../src/onboarding/intake-state.js";

const designSection = () => {
  const design = readFileSync("DESIGN.md", "utf8");
  return design.slice(design.indexOf("### 3.3"), design.indexOf("### 3.4"));
};
const tutorRules = () => {
  const css = readFileSync("src/overrides.css", "utf8");
  const start = css.indexOf("/* Contextual, non-assertive Tutor starting points");
  const rules = start < 0 ? "" : css.slice(start);
  const end = rules.search(/\r?\n\r?\n/);
  return end < 0 ? rules : rules.slice(0, end);
};

describe("course intake state", () => {
  it("is loading until the course request settles", () => {
    expect(courseIntakeState({ loaded: false, error: "", courseCount: 0 })).toBe("loading");
  });

  it("is empty only after a successful empty response", () => {
    expect(courseIntakeState({ loaded: true, error: "", courseCount: 0 })).toBe("empty");
  });

  it("is ready after a successful non-empty response", () => {
    expect(courseIntakeState({ loaded: true, error: "", courseCount: 2 })).toBe("ready");
  });

  it("is an error when the request failed, even with an empty course list", () => {
    expect(courseIntakeState({ loaded: true, error: "Local storage is unavailable.", courseCount: 0 })).toBe("error");
  });
});

describe("canvas view control contract", () => {
  it("names only the three actual views and no action panels", () => {
    expect(designSection()).toMatch(/Canvas \/ Lecture \/ Split/);
    expect(designSection()).not.toMatch(/Activities \/ Chemistry/);
  });

  it("documents Activities and Chemistry as actions rather than views", () => {
    expect(designSection()).toMatch(/Activities and Chemistry are actions/i);
  });

  it("keeps Notes as a panel toggle outside the view control", () => {
    expect(designSection()).toMatch(/Notes.*panel toggle/i);
  });
});

describe("tutor action token contract", () => {
  it("uses shared tokens instead of literal colors", () => {
    const rules = tutorRules();
    expect(rules).toMatch(/var\(--accent\)/);
    expect(rules).toMatch(/var\(--rule\)/);
    expect(rules).not.toMatch(/#ded7c9|#8a4f31|#574e43/);
  });

  it("meets min type and hit-target rules in both pointer modes", () => {
    const rules = tutorRules();
    expect(rules).toMatch(/font:600 12px/);
    expect(rules).toMatch(/min-height:36px/);
    expect(rules).toMatch(/min-height:44px/);
    expect(rules).not.toMatch(/min-height:32px/);
    expect(rules).toMatch(/:focus-visible/);
  });
});
