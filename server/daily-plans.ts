import type Database from "better-sqlite3";
import { getRecommendations, type Recommendation } from "./recommendations.js";

export type DailyPlanItem = Recommendation & {
  /** YYYY-MM-DD (UTC) this item is scheduled for. */
  day: string;
  /** "cited" when source exists; "derived" when the action comes from local activity only. */
  grounding: "cited" | "derived";
};

export type DailyPlan = {
  /** YYYY-MM-DD (UTC) the plan was generated for. */
  date: string;
  courseId: string;
  lessonId: string;
  /** Ordered by day, then priority; at most MAX_RECOMMENDATIONS (5). */
  items: DailyPlanItem[];
};

const DAY_ZERO_CAP = 3;
const HORIZON_DAYS = 3;
const MS_PER_DAY = 86_400_000;

export function buildDailyPlan(
  database: Database.Database,
  courseId: string,
  now: Date = new Date(),
  lessonId: string = "",
): DailyPlan {
  const date = now.toISOString().slice(0, 10);
  const recommendations = getRecommendations(database, courseId, lessonId, now);

  let practiceCount = 0;
  const withOffset = recommendations.map((item, index) => {
    let offset = 0;
    if (item.kind === "review") offset = 0;
    else if (item.kind === "practice" || item.kind === "relearn") {
      offset = practiceCount < DAY_ZERO_CAP ? 0 : 1;
      practiceCount += 1;
    } else if (item.kind === "canvas") offset = 1;
    else if (item.kind === "start") offset = 2;
    if (offset > HORIZON_DAYS - 1) offset = HORIZON_DAYS - 1;
    const day = new Date(Date.parse(date + "T00:00:00.000Z") + offset * MS_PER_DAY).toISOString().slice(0, 10);
    const grounding: "cited" | "derived" = item.source ? "cited" : "derived";
    return { item: { ...item, day, grounding } as DailyPlanItem, index };
  });

  withOffset.sort((a, b) => a.item.day.localeCompare(b.item.day) || a.index - b.index || a.item.id.localeCompare(b.item.id));

  return {
    date,
    courseId,
    lessonId,
    items: withOffset.map((entry) => entry.item),
  };
}
