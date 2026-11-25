const COURSE_TOKEN = /\b([A-Za-z]{2,}\s*\d+[A-Za-z]?)\s*$/;
const UNIT_PREFIX = /^\d+(?:\.\d+)*\s*[-:.]?\s*/;

const stem = (name: string) => name.replace(/\.[^.]+$/, "").trim();

/** Infer course and lesson names from dropped file names only. No model or network. */
export function inferCourseContext(
  files: readonly File[],
): { courseTitle: string; lessonTitle: string } {
  if (files.length === 0) return { courseTitle: "", lessonTitle: "" };

  const stems = files.map((file) => stem(file.name));
  const tokens = stems.map((value) => value.match(COURSE_TOKEN)?.[1]?.trim() ?? "");
  const shared =
    tokens[0] && tokens.every((token) => token.toLowerCase() === tokens[0].toLowerCase())
      ? tokens[0]
      : "";

  const first = stems[0];
  if (!shared) return { courseTitle: first, lessonTitle: "Introduction" };

  const unit = first.match(UNIT_PREFIX)?.[0].match(/^\d+/)?.[0] ?? "";
  const title = first.replace(COURSE_TOKEN, "").replace(UNIT_PREFIX, "").trim();
  return {
    courseTitle: shared,
    lessonTitle: unit ? `Unit ${unit}: ${title}` : title,
  };
}
