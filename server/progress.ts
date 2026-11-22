import type Database from "better-sqlite3";

export type LessonProgress = { id: string; title: string; attempts: number; correct: number; mastery: number };
export type CourseProgress = {
  lessons: LessonProgress[];
  totalAttempts: number;
  totalCorrect: number;
  conceptsMastered: number;
  dueReviews: number;
};

export function getCourseProgress(database: Database.Database, courseId: string): CourseProgress {
  const lessons = database.prepare(`
    SELECT lessons.id AS id, lessons.title AS title,
      COUNT(learning_attempts.id) AS attempts,
      COALESCE(SUM(learning_attempts.is_correct), 0) AS correct
    FROM lessons
    LEFT JOIN question_presentations ON question_presentations.lesson_id = lessons.id AND question_presentations.course_id = lessons.course_id
    LEFT JOIN learning_attempts ON learning_attempts.presentation_id = question_presentations.id
    WHERE lessons.course_id = ?
    GROUP BY lessons.id, lessons.title
    ORDER BY lessons.title
  `).all(courseId) as Array<{ id: string; title: string; attempts: number; correct: number }>;

  const masteryRows = database.prepare(`
    SELECT e.value AS value
    FROM learning_mastery_evidence e
    JOIN learning_concepts k ON k.id = e.concept_id
    WHERE k.course_id = ?
      AND e.sequence = (SELECT MAX(e2.sequence) FROM learning_mastery_evidence e2 WHERE e2.concept_id = e.concept_id)
  `).all(courseId) as Array<{ value: number }>;

  const due = (database.prepare(`
    SELECT learning_cards.fsrs_state AS fsrs_state
    FROM learning_cards
    JOIN learning_concepts k ON k.id = learning_cards.concept_id
    WHERE k.course_id = ?
  `).all(courseId) as Array<{ fsrs_state: string }>).filter((row) => {
    try {
      const dueAt = String(JSON.parse(row.fsrs_state).due ?? "");
      return Boolean(dueAt) && new Date(dueAt).getTime() <= Date.now();
    } catch { return false; }
  }).length;

  return {
    lessons: lessons.map((row) => ({
      id: row.id,
      title: row.title,
      attempts: Number(row.attempts),
      correct: Number(row.correct),
      mastery: masteryRows.length ? Math.round((masteryRows.reduce((sum, item) => sum + Number(item.value), 0) / masteryRows.length) * 100) / 100 : 0,
    })),
    totalAttempts: lessons.reduce((sum, row) => sum + Number(row.attempts), 0),
    totalCorrect: lessons.reduce((sum, row) => sum + Number(row.correct), 0),
    conceptsMastered: masteryRows.filter((row) => Number(row.value) > 0.5).length,
    dueReviews: due,
  };
}
