import { describe, expect, it } from "vitest";
import { inferCourseContext } from "../src/onboarding/context.js";

const file = (name: string) => ({ name }) as File;

describe("inferCourseContext", () => {
  it("uses a shared KIN-style prefix as the course and the unit as the lesson", () => {
    expect(inferCourseContext([file("1.1 Right Triangles KIN 120.pdf"), file("1.2 Oblique Triangles KIN 120.pdf")]))
      .toEqual({ courseTitle: "KIN 120", lessonTitle: "Unit 1: Right Triangles" });
  });
  it("falls back to a single file title when there is no shared course token", () => {
    expect(inferCourseContext([file("Photosynthesis notes.pdf")]))
      .toEqual({ courseTitle: "Photosynthesis notes", lessonTitle: "Introduction" });
  });
  it("returns honest empty strings for an empty drop", () => {
    expect(inferCourseContext([])).toEqual({ courseTitle: "", lessonTitle: "" });
  });
});
