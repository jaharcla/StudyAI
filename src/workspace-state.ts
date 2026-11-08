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
