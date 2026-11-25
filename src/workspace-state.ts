export type CourseChoice = { id: string };
export type LessonChoice = { id: string };

export function selectCourse<T extends CourseChoice>(courses: T[], preferredId: string | null): T | undefined {
  return courses.find((course) => course.id === preferredId) ?? courses[0];
}

export function selectLesson<T extends LessonChoice>(lessons: T[], preferredId: string | null): T | undefined {
  return lessons.find((lesson) => lesson.id === preferredId) ?? lessons[0];
}

export function lessonPreferenceKey(courseId: string): string {
  return `studyai.lesson.${encodeURIComponent(courseId)}`;
}

/**
 * A tutor thread belongs to a fully resolved course + lesson scope. While either
 * id is still loading the scope is incomplete: switching to it must not start a
 * new thread, or an in-flight answer loses its conversation.
 */
export function tutorThreadScope(courseId: string, lessonId: string): string {
  return courseId && lessonId ? `${courseId}:${lessonId}` : "";
}

export function shouldStartNewTutorThread(lastCompleteScope: string, courseId: string, lessonId: string): boolean {
  const next = tutorThreadScope(courseId, lessonId);
  return Boolean(next) && Boolean(lastCompleteScope) && lastCompleteScope !== next;
}
