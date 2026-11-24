import { expect, test } from "@playwright/test";
import { createCourseWithLesson } from "./helpers";

test.use({ viewport: { width: 1600, height: 1000 } });

test("narration starts, highlights the described object, shows a grounded transcript and stops without mutating the board", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(request);

  // Deterministic Web Speech: onend fires per cue so the timeline is observable.
  await page.addInitScript(() => {
    const synth = window.speechSynthesis;
    synth.cancel = () => { /* the stub has nothing queued */ };
    synth.speak = (utterance: SpeechSynthesisUtterance) => {
      window.setTimeout(() => {
        const end = new Event("end") as SpeechSynthesisEvent;
        utterance.onend?.call(utterance, end);
      }, 700);
    };
  });

  // Preselect the seeded workspace directly; the shared course-picker helper depends on a shell state
  // that is not reproducible in this worktree's local run.
  await page.addInitScript(({ courseId, lessonId }) => {
    localStorage.setItem("studyai.course", courseId);
    localStorage.setItem(`studyai.lesson.${encodeURIComponent(courseId)}`, lessonId);
  }, { courseId: course.id, lessonId: lesson.id });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();

  let boards: Array<{ id: string; name: string; revision: number }> = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    boards = await (await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`)).json();
    if (boards.length) break;
    await page.waitForTimeout(500);
  }
  expect(boards.length).toBeGreaterThan(0);
  const board = boards[0];
  const boardRow = await (await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`)).json();
  const document = JSON.parse(boardRow.document);

  document.objects = [
    {
      id: "force-abc-123", kind: "force", x: 420, y: 420, width: 10, height: 90,
      components: [0, 9.8, 0], units: "N", label: "F_N",
      geometry: { tail: { x: 420, y: 420 }, tip: { x: 420, y: 330 }, unitsPerCanvasUnit: 1 },
      provenance: { status: "generated-unverified", sourceRefs: ["doc:chapter-4"] },
    },
    {
      id: "force-def-456", kind: "force", x: 620, y: 420, width: 90, height: 10,
      components: [9.8, 0, 0], units: "N", label: "F_g",
      geometry: { tail: { x: 620, y: 420 }, tip: { x: 710, y: 420 }, unitsPerCanvasUnit: 1 },
    },
  ];

  const save = await request.post("/api/canvases", {
    data: {
      id: board.id, courseId: course.id, lessonId: lesson.id, name: board.name,
      document, expectedRevision: board.revision,
    },
  });
  expect(save.ok()).toBe(true);
  await page.reload();

  const readRevision = async () => (await (await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`)).json()).revision as number;
  const before = await readRevision();

  await expect(page.getByTestId("narration-open")).toBeVisible();
  await page.getByTestId("narration-open").click();
  await expect(page.getByTestId("narration-panel")).toBeVisible();
  await expect(page.getByTestId("narration-transcript-cue")).toHaveCount(2);

  const panelText = await page.getByTestId("narration-panel").innerText();
  expect(panelText).not.toContain("force-abc-123");
  expect(panelText).not.toContain("force-def-456");
  expect(panelText).not.toMatch(/\b(?:q|s|mw):/);
  expect(panelText).toContain("Generated · not verified");
  expect(panelText).toContain("Source 1");
  expect(panelText).toContain("From your board");
  await page.screenshot({ path: "test-results/narration-panel.png" });

  await page.getByTestId("narration-play").click();
  await expect(page.getByTestId("narration-highlight").first()).toBeVisible();
  await expect(page.getByTestId("narration-highlight").first()).toHaveAttribute("data-node-id", "force-abc-123");
  await expect(page.getByTestId("narration-caption")).toContainText("F_N");
  await page.screenshot({ path: "test-results/narration-highlight.png" });

  await expect(page.getByTestId("narration-highlight").first()).toHaveAttribute("data-node-id", "force-def-456");
  await expect(page.getByTestId("narration-caption")).toContainText("F_g");

  await page.getByTestId("narration-stop").click();
  await expect(page.getByTestId("narration-highlight")).toHaveCount(0);
  expect(await readRevision()).toBe(before);
});
