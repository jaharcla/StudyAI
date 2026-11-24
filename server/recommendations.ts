import type Database from "better-sqlite3";

export type RecommendationSource = { documentId?: string; title: string; page?: number | null; excerpt: string; sourceRef?: string };
export type RecommendationAction = { kind: "study" | "canvas" | "studio"; courseId: string; lessonId: string };
/** Deterministic descriptors the Coach uses to prepare a destination. No view logic here. */
export type RecommendationPreparation = {
  cardId?: string | null;
  boardId?: string | null;
  activityId?: string | null;
  dueAt?: string | null;
  focus?: string | null;
  sourceRef?: string | null;
};
export type Recommendation = {
  id: string;
  kind: "review" | "practice" | "relearn" | "canvas" | "start";
  title: string;
  reason: string;
  conceptId: string | null;
  concept: string | null;
  lessonId: string;
  lessonTitle: string;
  source: RecommendationSource | null;
  action: RecommendationAction;
  preparation: RecommendationPreparation;
  priority: number;
};

type ConceptRow = {
  concept_id: string;
  concept: string;
  lesson_id: string;
  lesson_title: string;
  mastery: number;
  attempts: number;
  correct: number;
  due_at: string | null;
  card_id: string | null;
  source_document_id: string | null;
  source_title: string | null;
  source_page: number | null;
  source_excerpt: string | null;
};

type CanvasRow = { concept_id: string; concept: string; lesson_id: string; lesson_title: string; source_refs_json: string; canvas_id: string | null; activity_id: string | null };
type FreshRow = { lesson_id: string; lesson_title: string; document_id: string; document_title: string; page: number | null; content: string };

const MAX_RECOMMENDATIONS = 5;
const WEAK_MASTERY = 0.5;

function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function questionSource(row: ConceptRow): RecommendationSource | null {
  if (!row.source_title || !row.source_excerpt) return null;
  return { documentId: row.source_document_id ?? undefined, title: row.source_title, page: row.source_page, excerpt: row.source_excerpt };
}

function activitySource(raw: string): RecommendationSource | null {
  try {
    const refs = JSON.parse(raw) as Array<{ sourceRef?: string; title?: string; excerpt?: string }>;
    const first = refs.find((ref) => ref && typeof ref.title === "string" && typeof ref.excerpt === "string");
    if (!first || !first.title || !first.excerpt) return null;
    const documentId = first.sourceRef?.match(/^doc:([^:]+)/)?.[1];
    return { documentId, title: first.title, excerpt: first.excerpt, sourceRef: first.sourceRef };
  } catch {
    return null;
  }
}

function documentSource(row: FreshRow): RecommendationSource {
  return { documentId: row.document_id, title: row.document_title, page: row.page, excerpt: row.content.slice(0, 300) };
}

/**
 * Projects local learning signals into a short, ranked list of next activities.
 * Read-only and deterministic: the same database state and `now` always produce the same list.
 */
export function getRecommendations(database: Database.Database, courseId: string, lessonId = "", now: Date = new Date()): Recommendation[] {
  const conceptRows = database.prepare(`
    SELECT k.id AS concept_id, k.name AS concept, k.lesson_id, l.title AS lesson_title,
      COALESCE((SELECT e.value FROM learning_mastery_evidence e WHERE e.concept_id = k.id
        ORDER BY e.occurred_at DESC, e.sequence DESC LIMIT 1), 0.1) AS mastery,
      COALESCE(act.attempts, 0) AS attempts,
      COALESCE(act.correct, 0) AS correct,
      (SELECT json_extract(c.fsrs_state, '$.due') FROM learning_cards c WHERE c.concept_id = k.id) AS due_at,
      (SELECT c.id FROM learning_cards c WHERE c.concept_id = k.id) AS card_id,
      (SELECT q.source_document_id FROM reviewed_questions q WHERE q.concept_id = k.id ORDER BY q.rowid DESC LIMIT 1) AS source_document_id,
      (SELECT q.source_title FROM reviewed_questions q WHERE q.concept_id = k.id ORDER BY q.rowid DESC LIMIT 1) AS source_title,
      (SELECT q.source_page FROM reviewed_questions q WHERE q.concept_id = k.id ORDER BY q.rowid DESC LIMIT 1) AS source_page,
      (SELECT q.source_excerpt FROM reviewed_questions q WHERE q.concept_id = k.id ORDER BY q.rowid DESC LIMIT 1) AS source_excerpt
    FROM learning_concepts k
    JOIN lessons l ON l.course_id = k.course_id AND l.id = k.lesson_id
    LEFT JOIN (
      SELECT q.concept_id AS cid, COUNT(*) AS attempts, SUM(a.is_correct) AS correct
      FROM learning_attempts a
      JOIN question_presentations p ON p.id = a.presentation_id
      JOIN reviewed_questions q ON q.id = p.question_id AND q.version = p.question_version
      GROUP BY q.concept_id
    ) act ON act.cid = k.id
    WHERE k.course_id = ? AND (? = '' OR k.lesson_id = ?)
  `).all(courseId, lessonId, lessonId) as ConceptRow[];

  const canvasRows = database.prepare(`
    SELECT e.concept_id, k.name AS concept, e.lesson_id, l.title AS lesson_title, e.source_refs_json,
      e.canvas_id, e.activity_id
    FROM learning_events e
    JOIN learning_concepts k ON k.id = e.concept_id
    JOIN lessons l ON l.course_id = e.course_id AND l.id = e.lesson_id
    WHERE e.course_id = ? AND (? = '' OR e.lesson_id = ?) AND e.outcome_status = 'incorrect'
    ORDER BY e.occurred_at DESC
  `).all(courseId, lessonId, lessonId) as CanvasRow[];

  const ranked = new Map<string, Recommendation>();
  const consider = (recommendation: Recommendation) => {
    const key = recommendation.conceptId ? `concept:${recommendation.conceptId}` : `lesson:${recommendation.lessonId}`;
    const existing = ranked.get(key);
    if (!existing || recommendation.priority > existing.priority) ranked.set(key, recommendation);
  };

  const make = (
    kind: Recommendation["kind"],
    priority: number,
    row: { concept_id?: string; concept?: string; lesson_id: string; lesson_title: string },
    source: RecommendationSource | null,
    preparation: RecommendationPreparation,
    title: string,
    reason: string,
  ): Recommendation => ({
    id: `${kind}:${row.concept_id ?? row.lesson_id}`,
    kind,
    priority,
    title,
    reason,
    conceptId: row.concept_id ?? null,
    concept: row.concept ?? null,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_title,
    source,
    action: { kind: kind === "canvas" ? "canvas" : kind === "start" ? "studio" : "study", courseId, lessonId: row.lesson_id },
    preparation,
  });

  for (const row of conceptRows) {
    const mastery = Number(row.mastery);
    const due = row.due_at ? Date.parse(row.due_at) <= now.getTime() : false;
    const attempts = Number(row.attempts);
    const correct = Number(row.correct);
    const source = questionSource(row);
    const concept = row.concept;
    const weight = (1 - Math.max(0, Math.min(1, mastery))) * 10;
    const preparation: RecommendationPreparation = { cardId: row.card_id, dueAt: row.due_at, focus: concept };

    if (due) {
      consider(make("review", 100 + weight, row, source, preparation, `Review ${concept}`, `A review of ${concept} is due. Answer a short question now to keep it fresh.`));
    } else if (mastery < WEAK_MASTERY && attempts > 0) {
      consider(make("practice", 80 + weight, row, source, preparation, `Practice ${concept}`, `${concept} is at ${percent(mastery)} mastery. Practice it with another reviewed question.`));
    } else if (attempts > correct && mastery < 0.7) {
      consider(make("relearn", 60 + weight, row, source, preparation, `Relearn ${concept}`, `Recent answers on ${concept} were incorrect. Read the source again, then try a new question.`));
    }
  }

  for (const row of canvasRows) {
    const preparation: RecommendationPreparation = { boardId: row.canvas_id, activityId: row.activity_id, focus: row.concept };
    consider(make("canvas", 40, row, activitySource(row.source_refs_json), preparation, `Rework ${row.concept} on the canvas`, `A canvas activity on ${row.concept} was marked incorrect. Reopen the board and rework it.`));
  }

  // Lessons with no learning signal still get one honest, cited next step.
  const freshRow = (database.prepare(`
    SELECT l.id AS lesson_id, l.title AS lesson_title, d.id AS document_id, d.title AS document_title, c.page, c.content
    FROM lessons l
    JOIN documents d ON d.course_id = l.course_id
    JOIN document_chunks c ON c.document_id = d.id AND c.course_id = d.course_id
    WHERE l.course_id = ? AND (? = '' OR l.id = ?)
      AND NOT EXISTS (SELECT 1 FROM learning_concepts k WHERE k.course_id = l.course_id AND k.lesson_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM learning_events e WHERE e.course_id = l.course_id AND e.lesson_id = l.id)
    ORDER BY l.title, d.title, c.id
    LIMIT 1
  `).get(courseId, lessonId, lessonId) as FreshRow | undefined);

  if (freshRow) {
    const source = documentSource(freshRow);
    source.sourceRef = `doc:${freshRow.document_id}`;
    const preparation: RecommendationPreparation = { focus: `${freshRow.document_title}: ${freshRow.content.slice(0, 160)}`, sourceRef: source.sourceRef };
    consider(make("start", 10, freshRow, source, preparation, `Create a study guide for ${freshRow.lesson_title}`, `No study activity yet in ${freshRow.lesson_title}. Make a study guide from your course sources in Studio.`));
  }

  return [...ranked.values()]
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    .slice(0, MAX_RECOMMENDATIONS);
}
