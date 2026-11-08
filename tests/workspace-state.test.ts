import { describe, expect, it } from "vitest";
import { lessonPreferenceKey, selectCourse, selectLesson } from "../src/workspace-state";

describe("active course and lesson selection", () => {
  const courses = [{ id: "course-a" }, { id: "course-b" }];
  const lessons = [{ id: "lesson-a" }, { id: "lesson-b" }];

  it("preserves a valid course choice and falls back when it is missing", () => {
    expect(selectCourse(courses, "course-b")).toBe(courses[1]);
    expect(selectCourse(courses, "removed-course")).toBe(courses[0]);
    expect(selectCourse([], "course-b")).toBeUndefined();
  });

  it("preserves lessons only within the selected course and uses a course-scoped preference key", () => {
    expect(selectLesson(lessons, "lesson-b")).toBe(lessons[1]);
    expect(selectLesson(lessons, "removed-lesson")).toBe(lessons[0]);
    expect(lessonPreferenceKey("course/a")).toBe("studyai.lesson.course%2Fa");
  });
});
