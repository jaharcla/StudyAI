import { expect, test } from "@playwright/test";
import { createCourseWithLesson } from "./helpers";

test.setTimeout(120000);

/** Set PRACTICE_COURSE_ID and PRACTICE_LESSON_ID to run this against a copy of a real course database. */
test("practice starts from a course excerpt and closes the answer loop", async ({ page, request }) => {
  const realCourseId = process.env.PRACTICE_COURSE_ID ?? "";
  const realLessonId = process.env.PRACTICE_LESSON_ID ?? "";
  let courseId: string, lessonId: string, courseTitle: string;
  if (realCourseId && realLessonId) {
    const courses = await (await request.get("/api/courses")).json() as Array<{ id: string; title: string }>;
    const course = courses.find((item) => item.id === realCourseId);
    expect(course, "real course must exist in the database").toBeDefined();
    courseId = realCourseId; lessonId = realLessonId; courseTitle = course!.title;
  } else {
    const created = await createCourseWithLesson(request, `Practice ${Date.now()}`, "Practice lesson");
    courseId = created.course.id; lessonId = created.lesson.id; courseTitle = created.course.title;
    await request.post("/api/documents", { data: { courseId, name: "practice.txt", content: "Planck set h = 6.626 x 10^-34 J s in his quantum hypothesis. An electron absorbs a photon and moves to a higher energy level." } });
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const toggle = page.getByTitle("Toggle courses");
  if (await toggle.isVisible()) await toggle.click();
  await page.locator(".course-list button").filter({ has: page.getByText(courseTitle, { exact: true }) }).click();
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
  await page.getByTitle("Open quizzes and flashcards").click();
  await page.getByRole("button", { name: "Ask a reviewed question" }).click();

  await expect(page.getByTestId("study-no-questions")).toBeVisible();
  await expect(page.getByTestId("study-no-questions")).toContainText("No reviewed questions");
  await expect(page.getByTestId("suggested-source")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/practice-01-empty.png" });

  await page.getByTestId("author-from-source").click();
  await expect(page.getByTestId("question-author")).toBeVisible();
  await expect(page.getByTestId("attached-source")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/practice-02-author.png" });

  const prompt = `What did Planck set h equal to? ${Date.now()}`;
  const form = page.getByTestId("question-author");
  await form.getByLabel("Concept").fill("Quantum theory");
  await form.getByLabel("Prompt").fill(prompt);
  await form.getByRole("textbox", { name: "Choice 1" }).fill("6.626 x 10^-34 J s");
  await form.getByRole("textbox", { name: "Choice 2" }).fill("9.8 m/s^2");
  await form.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByTestId("question-author")).toBeHidden();

  await page.getByRole("button", { name: "Ask a reviewed question" }).click();
  await expect(page.getByRole("heading", { name: prompt })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/practice-03-question.png" });
  await page.getByRole("button", { name: "6.626 x 10^-34 J s", exact: true }).click();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await expect(page.getByTestId("study-mastery")).toContainText("%");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/practice-04-answer.png" });
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByText("Review scheduled for", { exact: false })).toBeVisible();

  const resume = await (await request.get(`/api/study/resume?course=${courseId}&lesson=${lessonId}`)).json();
  expect(resume).toMatchObject({ phase: "ready" });
  const progress = await (await request.get(`/api/progress?course=${courseId}`)).json() as { totalAttempts: number };
  expect(progress.totalAttempts).toBeGreaterThan(0);
  const coach = await (await request.get(`/api/recommendations?course=${courseId}&lesson=${lessonId}`)).json() as { recommendations: unknown[] };
  expect(coach.recommendations.length).toBeGreaterThan(0);
});
