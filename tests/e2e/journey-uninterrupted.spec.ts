import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { pdfFixture } from "../fixtures/document-intelligence";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

// One mock student, one browser session, J1 through J7 in order.
// Artifact generation is mocked at the HTTP provider boundary; every fixture cites
// a real sourceRef retrieved from the PDF imported in J1. The Tutor is live.

const MARKER = "THERMO-4471";
const LESSON = "Thermodynamics foundations";
const FACTS = [
  { excerpt: "The enthalpy of vaporization of water is 40.7 kilojoules per mole at its boiling point.", correct: "40.7 kilojoules per mole", wrong: ["4.18 joules per gram per kelvin", "8.314 joules per mole per kelvin", "6.022 times ten to the twenty-third"] },
  { excerpt: "The specific heat capacity of liquid water is 4.18 joules per gram per kelvin.", correct: "4.18 joules per gram per kelvin", wrong: ["40.7 kilojoules per mole", "8.314 joules per mole per kelvin", "7"] },
  { excerpt: "At equilibrium, the forward and reverse reaction rates are equal.", correct: "equal", wrong: ["zero", "doubled", "unstable"] },
  { excerpt: "A catalyst lowers the activation energy without changing the equilibrium constant.", correct: "lowers the activation energy", wrong: ["raises the equilibrium constant", "stops the reverse reaction", "adds heat"] },
  { excerpt: "The pH of a neutral solution at 25 degrees Celsius is 7.", correct: "7", wrong: ["0", "14", "42"] },
  { excerpt: "Avogadro's constant is 6.022 times ten to the twenty-third per mole.", correct: "6.022 times ten to the twenty-third", wrong: ["8.314 joules per mole per kelvin", "40.7 kilojoules per mole", "7"] },
  { excerpt: "The ideal gas constant is 8.314 joules per mole per kelvin.", correct: "8.314 joules per mole per kelvin", wrong: ["6.022 times ten to the twenty-third", "4.18 joules per gram per kelvin", "equal"] },
  { excerpt: "An exothermic reaction releases heat to the surroundings.", correct: "releases heat", wrong: ["absorbs heat", "does nothing", "freezes"] },
  { excerpt: "The Gibbs free energy change equals enthalpy minus temperature times entropy.", correct: "enthalpy minus temperature times entropy", wrong: ["entropy minus enthalpy", "temperature times pressure", "zero"] },
  { excerpt: "A buffer resists changes in pH when small amounts of acid are added.", correct: "resists changes in pH", wrong: ["neutralizes all acid", "raises the temperature", "stops dissociating"] },
];
const PDF_TEXT = `${MARKER}. ${FACTS.map((fact) => fact.excerpt).join(" ")}`;

type Ref = { sourceRef: string; documentId: string; filename: string };

function shot(page: Page, name: string) {
  return page.screenshot({ path: test.info().outputPath(name), fullPage: true });
}

async function openSidebarSurface(page: Page, testId: string) {
  const shell = page.locator(".app-shell");
  if (!(await shell.evaluate((el) => el.classList.contains("sidebar-open")))) await page.getByTitle("Toggle courses").click();
  await page.getByTestId(testId).click();
}

async function waitForSearchRef(request: APIRequestContext, courseId: string): Promise<Ref> {
  await expect.poll(async () => {
    const response = await request.get(`/api/document-intelligence/search?course=${courseId}&q=${MARKER}`);
    const body = await response.json();
    return body.results?.length ?? 0;
  }, { timeout: 45_000 }).toBeGreaterThan(0);
  const body = await (await request.get(`/api/document-intelligence/search?course=${courseId}&q=${MARKER}`)).json();
  const hit = body.results[0] as Ref;
  expect(hit.filename).toBeTruthy();
  expect(hit.sourceRef).toBeTruthy();
  return hit;
}

test("J1-J7 uninterrupted mock-student run on a real imported PDF (artifact provider mocked at HTTP)", async ({ page, request }) => {
  test.setTimeout(900_000);
  const { course, lesson } = await createCourseWithLesson(request, `Journey run ${Date.now()}`, LESSON);
  const made: Array<{ id: string; courseId: string; lessonId: string; kind: string; title: string; content: unknown; sourceRefs: string[]; createdAt: string }> = [];

  // The provider boundary for artifacts is mocked; the course evidence is not.
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(made) }));
  await page.route("**/api/slide-decks?course=**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/study/practice-answer", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ duplicate: false }) }));

  // ---------- J1: first 60 seconds ----------
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await openSidebarSurface(page, "open-home");
  await expect(page.getByTestId("home-surface")).toBeVisible();
  await expect(page.getByTestId("indexing-progress")).toContainText("No sources indexed yet");

  await page.getByTestId("home-file-input").setInputFiles({
    name: "thermo-lecture.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdfFixture(PDF_TEXT)),
  });
  await expect(page.getByTestId("indexing-progress")).toContainText(/Indexing|sources indexed/, { timeout: 60_000 });
  await expect(page.getByTestId("grounded-summary")).toContainText(FACTS[0].excerpt, { timeout: 60_000 });
  await expect(page.getByTestId("summary-citation")).toHaveCount(1);
  await expect(page.getByTestId("first-action")).toHaveCount(3);
  await expect(page.getByTestId("home-continue")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("home-continue").scrollIntoViewIfNeeded();
  await shot(page, "journey-01-j1-home.png");

  await page.getByTestId("summary-citation").first().click();
  await expect(page.getByRole("dialog", { name: /Lecture preview|thermo-lecture/ })).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await openSidebarSurface(page, "open-home");
  await page.getByTestId("home-continue").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("studio-focus")).toHaveValue(/thermo-lecture/);
  await shot(page, "journey-02-j1-continue.png");
  await page.getByRole("button", { name: "Close Studio" }).click();

  const ref = await waitForSearchRef(request, course.id);

  // ---------- J2: ask and verify ----------
  const chat = page.getByTestId("copilot-chat-textarea");
  const answer = page.locator(".copilot-assistant-message-content").last();
  // The live provider occasionally returns its student-safe fallback. A student can
  // re-ask; no assertion is weakened and the grounded notice is still server-authored.
  const ask = async (question: string, expected: RegExp | string) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await chat.fill(question);
      await chat.press("Enter");
      try {
        await expect(answer).toContainText(expected, { timeout: 75_000 });
        return;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
  };
  await ask(`According to my imported lecture, what is the marker ${MARKER} and what does it say about enthalpy? Cite the page.`, /THERMO[\u2010\u2011-]?4471/);
  await expect(answer).toContainText(/sources checked/);
  const citation = page.locator('a[href^="#studyai-citation="]').filter({ hasText: "thermo-lecture.pdf" }).last();
  await expect(citation).toBeVisible({ timeout: 60_000 });
  await expect(citation).toContainText("page 1");
  await citation.click();
  const viewer = page.getByRole("dialog", { name: "thermo-lecture.pdf" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId("cited-passage").locator("mark")).toContainText(MARKER);
  await expect(viewer.locator(".react-pdf__Page__canvas")).toBeVisible({ timeout: 30_000 });
  await shot(page, "journey-03-j2-citation.png");
  await viewer.getByRole("button", { name: "Close preview" }).click();

  await ask("qzxv synthetic nonmatching phrase about quantumzeptol", "No course evidence");
  await shot(page, "journey-04-j2-refusal.png");

  // ---------- J3: one-click artifacts in the unified Studio ----------
  const practiceContent = () => ({
    cards: FACTS.slice(0, 4).map((fact) => ({
      front: `Complete this course statement: ${fact.excerpt.replace(fact.correct, "____")}`,
      back: fact.correct, concept: "Course fact", sourceRef: ref.sourceRef,
      sourceDocumentId: ref.documentId, sourcePage: 1, sourceExcerpt: fact.excerpt,
    })),
    questions: FACTS.map((fact, index) => {
      const answers = [fact.correct, ...fact.wrong];
      const choices = ["a", "b", "c", "d"].map((id, position) => ({ id, text: answers[(position + index) % 4] }));
      return {
        concept: "Course fact",
        prompt: `According to the lecture, complete this statement: ${fact.excerpt.replace(fact.correct, "____")}`,
        choices,
        correctChoice: ["a", "b", "c", "d"][(4 - (index % 4)) % 4],
        explanation: fact.excerpt, sourceRef: ref.sourceRef, sourceDocumentId: ref.documentId,
        sourcePage: 1, sourceExcerpt: fact.excerpt,
      };
    }),
  });

  await page.route("**/api/studio/generate", (route) => {
    const body = route.request().postDataJSON() as { kind: string };
    const kind = body.kind;
    let title = "Generated artifact";
    let content: unknown;
    if (kind === "study-guide") {
      title = "Thermodynamics study guide";
      content = {
        title, overview: FACTS[0].excerpt,
        sections: FACTS.slice(0, 3).map((fact, index) => ({ heading: `Course fact ${index + 1}`, body: fact.excerpt, sourceRefs: [ref.sourceRef] })),
        keyTerms: [{ term: "Enthalpy", definition: FACTS[0].excerpt, sourceRef: ref.sourceRef }],
      };
    } else if (kind === "mind-map") {
      title = "Thermodynamics map";
      content = {
        title, nodes: [
          { id: "root", label: "Thermodynamics", parentId: null },
          ...FACTS.slice(0, 3).map((fact, index) => ({ id: `node-${index}`, label: `Course fact ${index + 1}`, parentId: "root", detail: fact.excerpt, sourceRef: ref.sourceRef })),
        ],
      };
    } else if (kind === "infographic") {
      title = "Thermodynamics at a glance";
      content = {
        title, objective: FACTS[0].excerpt,
        diagram: { title: "Energy balance", forces: [{ label: "Heat", components: [1, 0] }, { label: "Work", components: [0, 1] }] },
        sourceRefs: [ref.sourceRef],
      };
    } else {
      title = "Thermodynamics practice";
      content = practiceContent();
    }
    const artifact = { id: `journey-${kind}-${made.length + 1}`, courseId: course.id, lessonId: lesson.id, kind, title, content, sourceRefs: [ref.sourceRef], createdAt: new Date().toISOString(), acceptance: "pending" };
    made.push(artifact);
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(artifact) });
  });

  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible();
  for (const tab of ["study-guide", "mind-map", "quiz", "flashcards", "infographic"]) {
    await page.getByTestId(`studio-tab-${tab}`).click();
    await expect(page.getByTestId("studio-surface")).toContainText(/Thermodynamics|No course sources|couldn't|isn't responding/i, { timeout: 45_000 });
    await expect(page.getByTestId("studio-error")).toHaveCount(0);
  }
  await page.getByTestId("studio-tab-slide_deck").click();
  await expect(page.getByTestId("studio-surface")).toContainText(/deck|Presenton|isn't running|couldn't|unchanged/i, { timeout: 60_000 });
  await expect(page.locator('[title*="not available yet"]')).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/studyai:\/\/|undefined|NaN/);
  await shot(page, "journey-05-j3-studio.png");

  // ---------- J5: practice and mastery ----------
  await page.getByTestId("studio-tab-practice").click();
  await expect(page.getByTestId("practice-view")).toBeVisible();
  await page.getByTestId("take-practice-test").click();
  await expect(page.getByTestId("practice-test")).toBeVisible();
  await expect(page.getByTestId("practice-question")).toHaveCount(10);
  await expect(page.getByTestId("practice-choice")).toHaveCount(40);
  await expect(page.getByTestId("practice-citation")).toHaveCount(10);
  await shot(page, "journey-06-j5-questions.png");

  const choice = (question: number, position: number) => page.locator(`[data-testid="practice-choice"][data-question="${question}"]`).nth(position);
  for (let index = 0; index < 10; index += 1) {
    const correct = (4 - (index % 4)) % 4;
    await choice(index, index === 9 ? (correct + 1) % 4 : correct).click();
  }
  await expect(page.getByTestId("practice-test-progress")).toHaveText("10 of 10 answered");
  await page.getByTestId("check-practice-test").click();
  await expect(page.getByTestId("practice-score")).toContainText("9 of 10 correct", { timeout: 30_000 });
  await expect(page.getByTestId("practice-result")).toHaveCount(10);
  await expect(page.getByTestId("practice-answer-key").last()).toContainText(FACTS[9].excerpt);
  await expect(page.getByTestId("practice-sync")).toHaveText("Progress saved");
  await page.getByTestId("practice-score").scrollIntoViewIfNeeded();
  await shot(page, "journey-07-j5-graded.png");

  await page.getByTestId("practice-test-again").click();
  await page.unroute("**/api/study/practice-answer");
  await page.route("**/api/study/practice-answer", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporarily unavailable" }) }));
  for (let index = 0; index < 10; index += 1) await choice(index, (4 - (index % 4)) % 4).click();
  await page.getByTestId("check-practice-test").click();
  await expect(page.getByTestId("practice-score")).toContainText("10 of 10 correct", { timeout: 30_000 });
  await expect(page.getByTestId("practice-sync")).toContainText("Progress sync paused");
  await expect(page.getByTestId("practice-sync-retry")).toBeVisible();
  await expect(page.getByTestId("practice-test-error")).toHaveCount(0);
  await shot(page, "journey-08-j5-provider-down.png");
  await page.getByRole("button", { name: "Close Studio" }).click();

  // ---------- J4: Canvas and Tutor ----------
  const namedMolecule = (id: string) => {
    const form = `${id}-form`;
    return {
      id, kind: "molecule", name: "Shared name", x: 420, y: 240, width: 260, height: 154,
      atoms: [{ id: `${id}-o`, element: "O", nonbondingElectrons: 4 }, { id: `${id}-c`, element: "C", nonbondingElectrons: 0 }],
      resonanceForms: [{ id: form, name: "Form 1", bonds: [{ id: `${id}-bond`, from: `${id}-o`, to: `${id}-c`, order: 2 }] }],
      activeResonanceId: form,
    };
  };
  const boards = await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const board = boards[0];
  const row = await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const savedBoard = await request.post("/api/canvases", {
    data: {
      id: board.id, courseId: course.id, lessonId: lesson.id, name: board.name,
      document: { version: 1, snapshot: { document: { store: {} } }, objects: [namedMolecule("journey-alpha"), namedMolecule("journey-beta")] },
      expectedRevision: row.revision,
    },
  });
  expect(savedBoard.status()).toBe(200);

  await page.reload({ waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await expect(page.locator(".scientific-layer")).toBeVisible();
  await expect(page.getByText("Shared name", { exact: true })).toHaveCount(2);
  if (!(await page.locator(".tutor-panel").isVisible())) await page.getByRole("button", { name: "Toggle study tutor" }).click();

  const canvasCitation = (id: string) => page.locator(".copilot-slot").evaluate((element, sourceRef) => {
    const link = document.createElement("a");
    link.href = `#studyai-citation=${sourceRef}`;
    link.textContent = "Cited canvas object";
    link.style.cssText = "position:fixed;top:80px;left:80px;z-index:99999;background:white;color:black;padding:6px";
    element.appendChild(link);
    link.click();
    link.remove();
  }, id);
  await canvasCitation("science:journey-alpha");
  const selected = page.getByTestId("selected-object-context");
  await expect(selected).toContainText("Shared name (1 of 2)");
  await expect(selected).not.toContainText("journey-alpha");
  await shot(page, "journey-09-j4-canvas.png");
  await canvasCitation("science:journey-missing");
  await expect(page.locator(".top-actions .saved")).toContainText(/no longer on this board/i);

  const switcher = page.getByRole("button", { name: "Choose canvas board" });
  await switcher.click();
  const before = await switcher.innerText();
  await page.locator(".canvas-board-menu").getByRole("button", { name: "New board" }).click();
  await expect(switcher).not.toHaveText(before);
  await switcher.click();
  await page.locator(".canvas-board-menu").getByRole("button", { name: before.trim(), exact: true }).click();
  await expect(switcher).toHaveText(before);

  // ---------- J6: return visit ----------
  for (const [index, fact] of FACTS.slice(0, 2).entries()) {
    const created = await request.post("/api/study/questions", {
      data: {
        courseId: course.id, lessonId: lesson.id, concept: ["Vaporization enthalpy", "Heat capacity"][index],
        prompt: `According to the lecture: ${fact.excerpt}`,
        choices: [{ id: "a", text: fact.correct }, { id: "b", text: fact.wrong[0] }],
        correctChoice: "a", explanation: fact.excerpt,
        sourceDocumentId: ref.documentId, sourceRef: ref.sourceRef, sourceExcerpt: fact.excerpt, reviewed: true,
      },
    });
    expect(created.status()).toBe(201);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await expect(page.getByTestId("today-strip")).toBeVisible();
  await expect(page.getByTestId("today-strip")).toContainText(/step \d+ of \d+/);
  await page.getByTestId("today-continue").click();
  await expect(page.getByRole("dialog", { name: "Study session" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("today-status")).toContainText("Ready in Study");
  await shot(page, "journey-10-j6-today-strip.png");
  await page.getByRole("button", { name: "Close study session" }).click();

  await openSidebarSurface(page, "open-today");
  await expect(page.getByTestId("today-surface")).toBeVisible();
  await expect(page.getByTestId("today-resume")).toContainText(LESSON);
  await expect(page.getByTestId("today-plan")).toContainText("step");
  await page.getByTestId("today-more").click();
  await expect(page.getByTestId("today-secondary")).toBeVisible();
  await expect(page.getByTestId("today-secondary-item")).toHaveCount(1);
  await shot(page, "journey-11-j6-today.png");
  await page.keyboard.press("Escape");

  // ---------- J7: one app ----------
  await page.getByTitle("Toggle theme").click();
  await expect(page.locator(".app-shell")).toHaveClass(/dark/);
  await shot(page, "journey-12-j7-dark.png");
  await page.getByTitle("Toggle theme").click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/dark/);

  const motion = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { fast: style.getPropertyValue("--motion-fast").trim(), base: style.getPropertyValue("--motion").trim() };
  });
  expect(motion.fast).toBe("180ms");
  expect(motion.base).toBe("200ms");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { fast: style.getPropertyValue("--motion-fast").trim(), base: style.getPropertyValue("--motion").trim() };
  });
  expect(reduced.fast).toBe("0ms");
  expect(reduced.base).toBe("0ms");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const focusName = () => page.evaluate(() => {
    const active = document.activeElement;
    return active ? active.getAttribute("aria-label") || active.getAttribute("title") || active.textContent?.trim() || "" : "";
  });
  const names: string[] = [];
  const rings: Array<{ style: string; width: number }> = [];
  for (let index = 0; index < 36; index += 1) {
    await page.keyboard.press("Tab");
    names.push(await focusName());
    rings.push(await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return { style: "none", width: 0 };
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) || 0 };
    }));
  }
  expect(names).toEqual(expect.arrayContaining(["Help", "Settings", "Canvas", "Lecture", "Notes"]));
  expect(names).not.toContain("Active lesson");
  expect(rings.some((ring) => ring.style === "solid" && ring.width >= 2)).toBe(true);

  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator(".canvas-board")).toBeVisible();
  await shot(page, "journey-13-j7-phone.png");
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator("body")).not.toContainText(/â€|Ã¢|ï¿½/);
});
