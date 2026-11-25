export type CourseIntakeState = "loading" | "empty" | "ready" | "error";

export type CourseIntakeInput = { loaded: boolean; error: string; courseCount: number };

// A failed course request must never be presented as a successful empty workspace.
export function courseIntakeState(input: CourseIntakeInput): CourseIntakeState {
  if (!input.loaded) return "loading";
  if (input.error.trim()) return "error";
  return input.courseCount === 0 ? "empty" : "ready";
}
