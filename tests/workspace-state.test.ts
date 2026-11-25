import { describe, expect, it } from "vitest";
import { lessonPreferenceKey, selectCourse, selectLesson, shouldStartNewTutorThread, tutorThreadScope } from "../src/workspace-state";

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

describe("tutor thread scope", () => {
  it("only treats a fully resolved scope as complete", () => {
    expect(tutorThreadScope("kin-120", "unit-1")).toBe("kin-120:unit-1");
    expect(tutorThreadScope("kin-120", "")).toBe("");
    expect(tutorThreadScope("", "unit-1")).toBe("");
    expect(tutorThreadScope("", "")).toBe("");
  });

  it("keeps the conversation when a course or lesson is temporarily empty", () => {
    // Initial load: course arrives before lessons, then the lesson loads.
    expect(shouldStartNewTutorThread("", "kin-120", "")).toBe(false);
    expect(shouldStartNewTutorThread("", "kin-120", "unit-1")).toBe(false);
    // A transient clearing of the lesson during an in-flight answer must not reset the thread.
    expect(shouldStartNewTutorThread("kin-120:unit-1", "kin-120", "")).toBe(false);
    expect(shouldStartNewTutorThread("kin-120:unit-1", "", "")).toBe(false);
  });

  it("starts a new thread only when the student moves to a different complete scope", () => {
    expect(shouldStartNewTutorThread("kin-120:unit-1", "kin-120", "unit-2")).toBe(true);
    expect(shouldStartNewTutorThread("kin-120:unit-1", "chem-120", "unit-1")).toBe(true);
    expect(shouldStartNewTutorThread("kin-120:unit-1", "kin-120", "unit-1")).toBe(false);
  });
});
