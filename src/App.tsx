import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CopilotChat, CopilotChatConfigurationProvider, CopilotKitProvider, useAgent, useAgentContext, useCopilotChatConfiguration, useCopilotKit } from "@copilotkit/react-core/v2";
import { Activity, Atom, BookOpen, Brain, CalendarDays, ChevronLeft, ChevronRight, CircleHelp, FileText, GraduationCap, Layers, Menu, Moon, MoreHorizontal, Network, PanelRightClose, PanelRightOpen, Plus, Search, Settings2, Sparkles, Sun, X } from "lucide-react";
import { formalCharge, vectorDot, vectorMagnitude, type Element } from "./science";
import { CanvasStudio } from "./canvas/CanvasStudio";
import { parseCanvasCitation } from "./canvas/citation-focus";
import { DOCUMENT_API, parseSourceReference, requestJson } from "./components/document-intelligence/api";
import type { ActivitySession } from "./learning/ActivityLibrary";
import { lessonPreferenceKey, selectCourse, selectLesson, shouldStartNewTutorThread, tutorThreadScope } from "./workspace-state";
import FreeKeyGuide from "./FreeKeyGuide";
import SearchDialog from "./components/SearchDialog";
import ProgressDialog from "./components/ProgressDialog";
import HelpDialog from "./components/HelpDialog";
import TutorMenu from "./components/TutorMenu";
import { LibraryArtifactTool } from "./tutor/LibraryArtifactTool";
import { MathEvaluationTool } from "./tutor/MathEvaluationTool";
import { MathResultCard } from "./tutor/MathResultCard";
import type { MathResult } from "./math/evaluator";
import { useDialogFocus } from "./components/useDialogFocus";
const DocumentLibrary = lazy(() => import("./components/document-intelligence").then((module) => ({ default: module.DocumentLibrary })));
const VegaChartToolRenderer = lazy(() => import("./charts/VegaChartTool").then((module) => ({ default: module.VegaChartToolRenderer })));
const FlashcardReview = lazy(() => import("./learning/FlashcardReview"));
const ActivityLibrary = lazy(() => import("./learning/ActivityLibrary").then((module) => ({ default: module.ActivityLibrary })));
const ActivityTaskPanel = lazy(() => import("./learning/ActivityTaskPanel").then((module) => ({ default: module.ActivityTaskPanel })));
const StudyStage = lazy(() => import("./lab/StudyStage"));
const StudioSurface = lazy(() => import("./studio/StudioSurface"));
const ConceptGraphView = lazy(() => import("./studio/ConceptGraphView"));

function ModeSurfaceLoading() {
  return <div className="mode-surface-loading" data-testid="mode-surface-loading" role="status">Loading surface…</div>;
}


import { API, CREDITS_API } from "./api";
import { Streamdown, defaultRemarkPlugins, defaultRehypePlugins } from "streamdown";
import { useCoach } from "./coach/useCoach";
import { dailyPlanProducer } from "./coach/dailyPlanProducer";
import { registerCoachProducer } from "./coach/service";
import { studyPreparationResult, type CoachPreparationResult, type CoachTarget } from "./coach/contract";
import { HomeSurface, TodayStrip, TodaySurface } from "./today/DailySurfaces.js";
import { OneDropSurface } from "./onboarding/OneDropSurface.js";
import { PreparedQuestion } from "./onboarding/PreparedQuestion.js";

// Paid rail is dormant (PRODUCT_ROADMAP, 2026-11-23). Off unless explicitly enabled.
const PAID_ENABLED = import.meta.env.VITE_STUDYAI_PAID_ENABLED === "1";
// Features only register producers; the Coach surface and activation live in src/coach.
registerCoachProducer(dailyPlanProducer);
import "katex/dist/katex.min.css";

type Course = { id: string; title: string; code: string; color: string };
type View = "Canvas" | "Lecture" | "Split";
type Lesson = { id: string; title: string };
type TutorStatus = { mode: string; provider: string; model: string; pickerActive: boolean; note: string };
type IntakeContext = { courseId: string; lessonId: string; courseTitle: string; lessonTitle: string };
type TutorQuestion = IntakeContext & { question: string; sourceTitle: string; sourceRef: string };
type RetrievedPassage = { title: string; excerpt: string; sourceRef: string };
type SurfaceWork = { reviewed: number; artifacts: number; concepts: number };
const noCourse: Course = { id: "", title: "", code: "", color: "#888888" };
const generatedCourseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Only collapse generated courses when the picker is flooded; small workspaces keep every course visible.
const generatedCourseFlood = 100;

function humanizeLessonTitle(title: string): string {
  const match = /^([a-z]+)\s*(\d{3,4})$/i.exec(title.trim());
  if (match) return `${match[1].toUpperCase()} ${match[2]}`;
  return title.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function CustomMarkdownRenderer(props: { content: string; messageId?: string }) {
  const remarkPluginsRecord = { ...defaultRemarkPlugins };
  const mathEntry = remarkPluginsRecord.math;
  if (Array.isArray(mathEntry)) {
    remarkPluginsRecord.math = [mathEntry[0], { ...(mathEntry[1] as Record<string, unknown>), singleDollarTextMath: true }];
  }
  const remarkPlugins = Object.values(remarkPluginsRecord);
  const { raw, sanitize, katex, harden } = defaultRehypePlugins;
  const rehypePlugins = [raw, sanitize, katex, harden];
  return (
    <div data-testid="custom-markdown-renderer" className="copilot-assistant-message-content prose dark:prose-invert max-w-none text-xs leading-relaxed">
      <Streamdown rehypePlugins={rehypePlugins} remarkPlugins={remarkPlugins}>
        {props.content}
      </Streamdown>
    </div>
  );
}

function Workspace() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState(noCourse);
  const [courseError, setCourseError] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [lessonError, setLessonError] = useState("");
  const lessonTitle = humanizeLessonTitle(lessons.find((item) => item.id === lessonId)?.title ?? "");
  const [view, setView] = useState<View>("Canvas");
  const [mode, setMode] = useState<"canvas" | "home" | "today" | "study" | "studio" | "concepts">("canvas");
  const [studyReturn, setStudyReturn] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tutorMenuOpen, setTutorMenuOpen] = useState(false);
  const [flashcardReviewOpen, setFlashcardReviewOpen] = useState(false);
const [initialArtifactId, setInitialArtifactId] = useState<string | undefined>();
const [initialDeckId, setInitialDeckId] = useState<string | undefined>();
  const tutorConfig = useCopilotChatConfiguration();
  const { agent: tutorAgent } = useAgent();
  const { copilotkit } = useCopilotKit();
  const tutorScope = useRef("");
  useEffect(() => {
    if (shouldStartNewTutorThread(tutorScope.current, course.id, lessonId)) tutorConfig?.startNewThread();
    const complete = tutorThreadScope(course.id, lessonId);
    if (complete) tutorScope.current = complete;
  }, [course.id, lessonId, tutorConfig]);
  const [tutor, setTutor] = useState(true);
  const [tutorQuestion, setTutorQuestion] = useState<TutorQuestion | null>(null);
  const [surfaceWork, setSurfaceWork] = useState<SurfaceWork>({ reviewed: 0, artifacts: 0, concepts: 0 });
  const [showAllCourses, setShowAllCourses] = useState(false);
  const flooded = courses.length > generatedCourseFlood && !showAllCourses;
  const visibleCourses = flooded ? courses.filter((item) => !generatedCourseId.test(item.id)) : courses;
  const hiddenCourseCount = courses.length - visibleCourses.length;
  const [dark, setDark] = useState(false);
  const [settings, setSettings] = useState(false);
  const [models, setModels] = useState<Array<{ name: string; size: number }>>([]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("studyai.model") ?? "");
  const [aiStatus, setAiStatus] = useState("Checking Ollama…");
  const [tutorStatus, setTutorStatus] = useState<TutorStatus | null>(null);
  const [creditProvider, setCreditProvider] = useState(() => localStorage.getItem("studyai.credit.provider") ?? "local");
  const [creditToken] = useState(() => {
    const saved = localStorage.getItem("studyai.credits.token");
    if (saved) return saved;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("studyai.credits.token", token);
    return token;
  });
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditCode, setCreditCode] = useState("");
  const [creditQuestion, setCreditQuestion] = useState("");
  const [creditAnswer, setCreditAnswer] = useState("");
  const [creditStatus, setCreditStatus] = useState("");
  const [supportKind, setSupportKind] = useState<"donation" | "credits">("donation");
  const [supportChoice, setSupportChoice] = useState("small");
  const [supportStatus, setSupportStatus] = useState("");
  const creditClientToken = String(import.meta.env.VITE_STUDYAI_CLIENT_TOKEN ?? "");
  const creditRecovery = `RC-${creditToken.match(/.{1,4}/g)?.join("-") ?? creditToken}`;
  const activeTutor = tutorStatus ? (tutorStatus.model ? `${tutorStatus.provider} · ${tutorStatus.model}` : tutorStatus.note) : aiStatus;
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteId, setNoteId] = useState<string>();
  const [noteLoadedFor, setNoteLoadedFor] = useState("");
  const [scienceTool, setScienceTool] = useState<"chem" | "kin" | null>(null);
  const [activityLibraryOpen, setActivityLibraryOpen] = useState(false);
  const [activeActivity, setActiveActivity] = useState<ActivitySession | null>(null);
  const [preferredBoardId, setPreferredBoardId] = useState<string>();
  const [activityCanvasState, setActivityCanvasState] = useState<{ id: string; revision: number; saved: boolean } | null>(null);
  const [coachFocus, setCoachFocus] = useState("");
  const [todayNotice, setTodayNotice] = useState("");
  const [tutorContextOpen, setTutorContextOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Connecting to local storage…");
  const [tutorWidth, setTutorWidth] = useState(360);
  const [openDocumentId, setOpenDocumentId] = useState<string>();
  const [openSourceRef, setOpenSourceRef] = useState<string>();
  const [openSourceKey, setOpenSourceKey] = useState(0);
  const [canvasFocus, setCanvasFocus] = useState<{ ref: string; key: number }>();
  const dragRef = useRef(false);
  const [canvasSummary, setCanvasSummary] = useState({ objectCount: 0, objectTypes: {} as Record<string, number> });
  const updateCanvasSummary = useCallback((summary: { objectCount: number; objectTypes: Record<string, number> }) => setCanvasSummary(summary), []);
  const [selectedObject, setSelectedObject] = useState<{ id: string; name: string } | null>(null);
  const updateSelectedObject = useCallback((object: { id: string; name: string } | null) => setSelectedObject(object), []);
  const updateStatus = useCallback((next: string) => setStatus(next), []);
  const openSource = useCallback((sourceRef: string) => {
    setOpenDocumentId(undefined);
    setOpenSourceRef(sourceRef);
    setOpenSourceKey((key) => key + 1);
    setMode("canvas");
    setView("Lecture");
  }, []);

  const settingsRef = useRef<HTMLDivElement>(null);
  const noteDialogRef = useRef<HTMLDivElement>(null);
  const noteTitleRef = useRef<HTMLInputElement>(null);
  useDialogFocus(settings, settingsRef);
  useDialogFocus(noteOpen, noteDialogRef, noteTitleRef);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen((open) => !open); return; }
      if (event.key !== "Escape") return;
      if (mode !== "canvas") setMode("canvas");
      else if (activityLibraryOpen) setActivityLibraryOpen(false);
      else if (flashcardReviewOpen) setFlashcardReviewOpen(false);
      else if (helpOpen) setHelpOpen(false);
      else if (progressOpen) setProgressOpen(false);
      else if (searchOpen) setSearchOpen(false);
      else if (settings) setSettings(false);
      else if (noteOpen) setNoteOpen(false);
      else if (scienceTool) setScienceTool(null);
      else if (tutorMenuOpen) setTutorMenuOpen(false);
      else if (sidebar) setSidebar(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, activityLibraryOpen, flashcardReviewOpen, helpOpen, progressOpen, searchOpen, settings, noteOpen, scienceTool, tutorMenuOpen, sidebar]);

  // A prepared handoff belongs to one Studio visit. Escape, the sidebar and scope changes
  // all leave Studio without calling its close handler; a source focus from another lesson
  // must never survive into the next Studio visit.
  useEffect(() => {
    if (mode === "studio") return;
    setCoachFocus("");
    setInitialArtifactId(undefined);
    setInitialDeckId(undefined);
  }, [mode]);

  const updateActivityCanvas = useCallback((state: { id: string; revision: number; saved: boolean }) => setActivityCanvasState(state), []);
  const launchActivity = useCallback((session: ActivitySession) => {
    setActiveActivity(session);
    setPreferredBoardId(session.attempt.canvasId);
    setActivityCanvasState({ id: session.attempt.canvasId, revision: session.canvas.revision, saved: true });
    setActivityLibraryOpen(false);
    setView("Canvas");
  }, []);
  const closeActivity = useCallback(() => {
    setActiveActivity(null);
    setPreferredBoardId(undefined);
    setActivityCanvasState(null);
  }, []);

  // Activation prepares real state in the destination, then the pinned Coach is already there.
  // A failed preparation reports a plain message; no target is invented or navigated to.
  const prepareCoachTarget = useCallback(async (target: CoachTarget): Promise<CoachPreparationResult> => {
    const unavailable: CoachPreparationResult = { prepared: false, message: "" };
    if (!target.courseId || !target.lessonId) return unavailable;
    if (target.courseId !== course.id) {
      const next = courses.find((item) => item.id === target.courseId);
      if (!next) return unavailable;
      setCourse(next);
      localStorage.setItem("studyai.course", next.id);
      localStorage.setItem(lessonPreferenceKey(next.id), target.lessonId);
      setLessonId(target.lessonId);
    } else if (target.lessonId !== lessonId) {
      if (!lessons.some((item) => item.id === target.lessonId)) return unavailable;
      setLessonId(target.lessonId);
      localStorage.setItem(lessonPreferenceKey(course.id), target.lessonId);
    }
    const scope = `course=${encodeURIComponent(target.courseId)}&lesson=${encodeURIComponent(target.lessonId)}`;
    if (target.destination === "study") {
      const focused = target.conceptId ? `&concept=${encodeURIComponent(target.conceptId)}` : "";
      const response = await fetch(`${API}/study/ask?${scope}${focused}`);
      if (!response.ok) return unavailable;
      const result = studyPreparationResult(await response.json() as Parameters<typeof studyPreparationResult>[0]);
      setMode("study");
      return result;
    }
    if (target.destination === "board") {
      if (!target.boardId) return unavailable;
      const response = await fetch(`${API}/canvases/${encodeURIComponent(target.boardId)}?${scope}`);
      if (!response.ok) return unavailable;
      const board = await response.json() as { document?: unknown };
      if (!board.document) return unavailable;
      setPreferredBoardId(target.boardId);
      setView("Canvas");
      setMode("canvas");
      return { prepared: true, message: "Ready on the board. The saved activity is open." };
    }
    const focus = target.focus ?? "";
    setCoachFocus(focus);
    setMode("studio");
    return focus
      ? { prepared: true, message: "Ready in Studio. Your source focus is set." }
      : { prepared: false, message: "Studio is open, but no source focus was set for this lesson." };
  }, [course.id, courses, lessonId, lessons]);

  const coach = useCoach(
    { courseId: course.id, lessonId, boardId: preferredBoardId, boardRevision: activityCanvasState?.revision },
    prepareCoachTarget,
  );

  useEffect(() => {
    let live = true;
    fetch(`${API}/courses`).then(async (response) => { if (!response.ok) throw new Error("Local storage is unavailable."); return response.json() as Promise<Course[]>; }).then((rows) => {
      if (!live) return;
      setCourses(rows);
      const selected = selectCourse(rows, localStorage.getItem("studyai.course")) ?? noCourse;
      setCourse(selected);
      if (selected.id) localStorage.setItem("studyai.course", selected.id);
      setCourseError("");
      setStatus(rows.length ? "Local storage connected" : "No courses yet");
    }).catch((error) => { if (live) { setCourses([]); setCourse(noCourse); setCourseError(error instanceof Error ? error.message : "Could not load courses."); setStatus("Local storage unavailable"); } });
    fetch(`${API}/models`).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Ollama is unavailable.");
      return data;
    }).then((data) => {
      if (!live) return;
      const available: Array<{ name: string; size: number }> = Array.isArray(data.models) ? data.models : [];
      setModels(available);
      setAiStatus(available.length ? "Ollama connected" : "Ollama connected · no models installed");
      setSelectedModel((current) => {
        const next = available.some((item) => item.name === current) ? current : available.some((item) => item.name === data.configuredModel) ? data.configuredModel : (available[0]?.name ?? "");
        if (next) localStorage.setItem("studyai.model", next); else localStorage.removeItem("studyai.model");
        return next;
      });
    }).catch((error) => { if (live) { setModels([]); setSelectedModel(""); localStorage.removeItem("studyai.model"); setAiStatus(error instanceof Error ? error.message : "Ollama is unavailable"); } });
    fetch(`${API}/tutor-status`).then(async (response) => { const value = await response.json() as TutorStatus; if (live && response.ok) setTutorStatus(value); }).catch(() => { /* keep the Ollama status as fallback */ });
    return () => { live = false; };
  }, []);

  const creditHeaders = useCallback(() => ({
    "content-type": "application/json",
    authorization: `Bearer ${creditToken}`,
    "x-studyai-client": creditClientToken,
  }), [creditToken, creditClientToken]);

  const refreshCreditBalance = useCallback(async () => {
    try {
      const response = await fetch(`${CREDITS_API}/v1/wallet`, { headers: creditHeaders() });
      if (!response.ok) throw new Error("Wallet unavailable");
      const data = await response.json() as { balanceMicros: number };
      setCreditBalance(data.balanceMicros);
    } catch (error) {
      setCreditStatus(error instanceof Error ? error.message : "Wallet unavailable");
    }
  }, [creditHeaders]);

  useEffect(() => {
    if (PAID_ENABLED && creditProvider === "credits") void refreshCreditBalance();
  }, [creditProvider, refreshCreditBalance]);

  const redeemCredit = useCallback(async () => {
    try {
      const response = await fetch(`${CREDITS_API}/v1/redeem`, {
        method: "POST", headers: creditHeaders(), body: JSON.stringify({ code: creditCode }),
      });
      if (!response.ok) throw new Error("Code could not be redeemed");
      setCreditCode("");
      setCreditStatus("Credits added.");
      await refreshCreditBalance();
    } catch (error) {
      setCreditStatus(error instanceof Error ? error.message : "Code could not be redeemed");
    }
  }, [creditCode, creditHeaders, refreshCreditBalance]);

  const sendCreditChat = useCallback(async () => {
    const question = creditQuestion.trim();
    if (!question) return;
    setCreditStatus("");
    try {
      const response = await fetch(`${CREDITS_API}/v1/chat/completions`, {
        method: "POST",
        headers: creditHeaders(),
        body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: question }] }),
      });
      if (!response.ok) throw new Error("Credits chat unavailable");
      const data = await response.json() as { text: string; balanceMicros: number };
      setCreditAnswer(data.text);
      setCreditBalance(data.balanceMicros);
    } catch (error) {
      setCreditStatus(error instanceof Error ? error.message : "Credits chat unavailable");
    }
  }, [creditQuestion, creditHeaders]);

  const requestCheckout = useCallback(async () => {
    setSupportStatus("");
    try {
      const response = await fetch(`${CREDITS_API}/v1/checkout`, {
        method: "POST",
        headers: creditHeaders(),
        body: JSON.stringify({ kind: supportKind, choice: supportChoice }),
      });
      if (!response.ok) throw new Error("Checkout is unavailable right now.");
      const data = await response.json() as { url: string };
      setSupportStatus("Continuing to Stripe to complete payment…");
      window.location.href = data.url;
    } catch (error) {
      setSupportStatus(error instanceof Error ? error.message : "Checkout is unavailable right now.");
    }
  }, [supportKind, supportChoice, creditHeaders]);

  useEffect(() => {
    if (PAID_ENABLED && new URLSearchParams(window.location.search).get("checkout") === "success") {
      setSupportStatus("Payment received — credits may take a moment to appear.");
      void refreshCreditBalance();
    }
  }, [refreshCreditBalance]);

  useEffect(() => {
    const scope = course.id && lessonId ? `${course.id}:${lessonId}` : "";
    if (!scope) { setNote(""); setNoteId(undefined); setNoteTitle(""); setNoteLoadedFor(""); return; }
    let live = true;
    setNoteLoadedFor("");
    setNote(""); setNoteId(undefined); setNoteTitle(`${lessonTitle} notes`);
    fetch(`${API}/notes?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lessonId)}`).then(async (response) => { if (!response.ok) throw new Error("Notes could not be loaded."); return response.json(); }).then((rows) => { if (live) { if (rows[0]) { setNote(rows[0].body); setNoteId(rows[0].id); setNoteTitle(rows[0].title); } setNoteLoadedFor(scope); } }).catch((error) => { if (live) setStatus(error instanceof Error ? error.message : "Notes could not be loaded"); });
    return () => { live = false; };
  }, [course.id, lessonId, lessonTitle]);

  useEffect(() => {
    if (!noteOpen || !course.id || !lessonId || noteLoadedFor !== `${course.id}:${lessonId}`) return;
    const timer = window.setTimeout(() => {
      setStatus("Saving note…");
      fetch(`${API}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: noteId, courseId: course.id, lessonId, title: noteTitle, body: note }) })
        .then(async (response) => { const value = await response.json().catch(() => ({})); if (!response.ok) throw new Error(value.error || "Notes save unavailable"); return value; }).then((saved) => { setNoteId(saved.id); setStatus("Note saved"); }).catch((error) => setStatus(error instanceof Error ? error.message : "Notes save unavailable"));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [note, noteOpen, noteId, noteTitle, course.id, lessonId, noteLoadedFor]);

  useEffect(() => {
    let live = true;
    setOpenDocumentId(undefined); setOpenSourceRef(undefined); setQuery("");
    if (!course.id) { setLessons([]); setLessonId(""); return () => { live = false; }; }
    setLessons([]); setLessonId(""); setLessonError("");
    fetch(`${API}/lessons?course=${encodeURIComponent(course.id)}`).then(async (response) => { const value = await response.json().catch(() => ({})); if (!response.ok) throw new Error(value.error || "Lessons could not be loaded."); return value as Lesson[]; }).then((rows) => { if (live) { setLessons(rows); const selected = selectLesson(rows, localStorage.getItem(lessonPreferenceKey(course.id))); setLessonId(selected?.id ?? ""); if (selected) localStorage.setItem(lessonPreferenceKey(course.id), selected.id); } }).catch((error) => { if (live) setLessonError(error instanceof Error ? error.message : "Lessons could not be loaded."); });
    return () => { live = false; };
  }, [course.id]);

  // Progressive reveal reads only existing local signals. A failed or slow
  // count leaves the destination de-emphasised; it never invents work.
  useEffect(() => {
    if (!course.id) { setSurfaceWork({ reviewed: 0, artifacts: 0, concepts: 0 }); return; }
    let live = true;
    const query = encodeURIComponent(course.id);
    void Promise.allSettled([
      requestJson<{ totalAttempts: number }>(`${API}/progress?course=${query}`),
      requestJson<unknown[]>(`${API}/studio/artifacts?course=${query}`),
      requestJson<{ nodes: unknown[] }>(`${API}/concepts/graph?course=${query}`),
    ]).then(([progress, artifacts, concepts]) => {
      if (!live) return;
      setSurfaceWork({
        reviewed: progress.status === "fulfilled" ? Number(progress.value.totalAttempts) || 0 : 0,
        artifacts: artifacts.status === "fulfilled" && Array.isArray(artifacts.value) ? artifacts.value.length : 0,
        concepts: concepts.status === "fulfilled" && Array.isArray(concepts.value.nodes) ? concepts.value.nodes.length : 0,
      });
    });
    return () => { live = false; };
  }, [course.id]);

  const changeCourse = (next: Course) => {
    setSidebar(false);
    if (next.id === course.id) return;
    closeActivity(); setActivityLibraryOpen(false); setStudyReturn(false); setMode("canvas");
    setCourse(next);
    setLessons([]);
    setLessonId("");
    setStatus("Loading course…");
    localStorage.setItem("studyai.course", next.id);
  };

  const changeLesson = (nextId: string) => {
    setSidebar(false);
    closeActivity(); setActivityLibraryOpen(false); setStudyReturn(false); setMode("canvas");
    setLessonId(nextId);
    setStatus("Loading lesson…");
    if (course.id) localStorage.setItem(lessonPreferenceKey(course.id), nextId);
  };

  // Intake finished: prepare one question from a real retrieved passage, select
  // the new course and lesson, then open the Tutor. Nothing is auto-sent.
  const handleOneDropReady = useCallback(async (context: IntakeContext) => {
    // Hold the intake's ready confirmation long enough for it to be seen.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
    const prepared: TutorQuestion = { ...context, question: "", sourceTitle: "", sourceRef: "" };
    const query = context.lessonTitle || context.courseTitle;
    if (query) {
      try {
        const reply = await requestJson<{ status: string; results: RetrievedPassage[] }>(`${DOCUMENT_API}/retrieve?course=${encodeURIComponent(context.courseId)}&q=${encodeURIComponent(query)}`);
        const point = reply.status === "evidence" ? reply.results.find((item) => item.excerpt?.trim() && item.sourceRef) : undefined;
        if (point) {
          prepared.question = `From ${point.title}: "${point.excerpt.trim()}" — what does this passage mean?`;
          prepared.sourceTitle = point.title;
          prepared.sourceRef = point.sourceRef;
        }
      } catch { /* no retrieved passage: keep the honest abstention */ }
    }
    const selected = courses.find((item) => item.id === context.courseId) ?? { id: context.courseId, title: context.courseTitle, code: "", color: "#888888" };
    setCourses((current) => current.some((item) => item.id === selected.id) ? current : [...current, selected]);
    localStorage.setItem("studyai.course", selected.id);
    localStorage.setItem(lessonPreferenceKey(selected.id), context.lessonId);
    setCourse(selected);
    setLessons((current) => current.some((item) => item.id === context.lessonId) ? current : [...current, { id: context.lessonId, title: context.lessonTitle }]);
    setLessonId(context.lessonId);
    setMode("canvas");
    setView("Canvas");
    setTutor(true);
    setTutorQuestion(prepared);
    setStatus("Local storage connected");
  }, [courses]);

  const sendPreparedQuestion = useCallback((text: string) => {
    const content = text.trim();
    if (!content || !course.id || !lessonId) return;
    tutorAgent.addMessage({ id: crypto.randomUUID(), role: "user", content });
    void copilotkit.runAgent({ agent: tutorAgent });
  }, [tutorAgent, copilotkit, course.id, lessonId]);

  const addCourse = async () => {
    const title = window.prompt("Course name")?.trim();
    if (!title) return;
    try {
      const response = await fetch(`${API}/courses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error || "Course could not be created.");
      const created = value as Course;
      setCourses((current) => [...current, created]);
      changeCourse(created);
      setMode("home");
      setCourseError("");
    } catch (error) { setCourseError(error instanceof Error ? error.message : "Course could not be created."); }
  };

  const addLesson = async () => {
    if (!course.id) return;
    const title = window.prompt("Lesson name")?.trim();
    if (!title) return;
    try {
      const response = await fetch(`${API}/lessons`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId: course.id, title }) });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error || "Lesson could not be created.");
      const created = value as Lesson;
      setLessons((current) => [...current, created]);
      changeLesson(created.id);
      setLessonError("");
    } catch (error) { setLessonError(error instanceof Error ? error.message : "Lesson could not be created."); }
  };

  const openCitation = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (!href?.startsWith("#studyai-citation=")) return;
    event.preventDefault();
    try {
      const sourceRef = decodeURIComponent(href.slice("#studyai-citation=".length));
      if (parseCanvasCitation(sourceRef)) {
        setCanvasFocus({ ref: sourceRef, key: Date.now() });
        setView("Canvas");
        return;
      }
      if (!parseSourceReference(sourceRef)) return;
      setOpenDocumentId(undefined); setOpenSourceRef(sourceRef);
      setOpenSourceKey((key) => key + 1);
      setView("Lecture");
    } catch { return; }
  };

  const openLinkedNote = useCallback(async (id: string) => {
    try {
      const rows = await fetch(`${API}/notes?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lessonId)}`).then((response) => response.json());
      const linked = rows.find((item: { id: string }) => item.id === id);
      if (!linked) { setStatus("Linked note was not found"); return; }
      setNoteId(linked.id); setNoteTitle(linked.title); setNote(linked.body); setNoteOpen(true);
    } catch { setStatus("Linked note is unavailable"); }
  }, [course.id, lessonId]);

  const openLinkedDocument = useCallback((id: string, _title: string) => {
    setOpenSourceRef(undefined); setOpenDocumentId(id); setOpenSourceKey((key) => key + 1); setQuery(""); setView("Lecture");
  }, []);

  const changeWidth = (event: React.MouseEvent) => {
    if (!dragRef.current) return;
    setTutorWidth(Math.min(520, Math.max(300, window.innerWidth - event.clientX)));
  };

  const surfaceHasWork = { study: surfaceWork.reviewed > 0, studio: surfaceWork.artifacts > 0, concepts: surfaceWork.concepts > 0 };
  const nextSurface = (["study", "studio", "concepts"] as const).find((key) => surfaceHasWork[key]) ?? "canvas";
  const surfaceLabels = { canvas: "Canvas", study: "Study", studio: "Studio", concepts: "Concepts" } as const;

  return <>{course.id && lessonId && <AgentContext course={course} canvas={canvasSummary} view={view} model={tutorStatus?.model || selectedModel} lessonId={lessonId} lessonTitle={lessonTitle} />}<LibraryArtifactTool courseId={course.id} lessonId={lessonId} /><div className={`app-shell view-${view.toLowerCase()} ${dark ? "dark" : ""} ${sidebar ? "sidebar-open" : ""} ${tutor ? "tutor-open" : ""}`} style={{ "--tutor-width": `${tutorWidth}px` } as React.CSSProperties}>
    {sidebar && <><div className="sidebar-scrim" onClick={() => setSidebar(false)} /><aside className="sidebar" inert={!sidebar}>
      <div className="brand-row"><div className="brand-mark"><Sparkles size={17} /></div><span>study<span className="brand-ai">ai</span></span><button className="icon-button sidebar-close" onClick={() => setSidebar(false)} title="Collapse sidebar"><ChevronLeft size={16} /></button></div>
      <button className="search-button" onClick={() => setSearchOpen(true)} title="Search anything"><Search size={15} /><span>Search anything</span><kbd>⌘ K</kbd></button>
      <div className="nav-label">YOUR SPACE</div>
      <button className={`nav-item ${mode === "home" ? "active" : ""}`} data-testid="open-home" disabled={!course.id} onClick={() => { setSidebar(false); setMode("home"); }}><Sparkles size={17} /> Home</button>
      <button className={`nav-item ${mode === "today" ? "active" : ""}`} data-testid="open-today" disabled={!course.id} onClick={() => { setSidebar(false); setMode("today"); }}><CalendarDays size={17} /> Today</button>
      <button className={`nav-item ${mode === "canvas" ? "active" : ""}`} onClick={() => setMode("canvas")}><GraduationCap size={17} /> Study workspace</button>
      <button className="nav-item" onClick={() => setProgressOpen(true)}><Activity size={17} /> Learning progress</button>
      <div className="course-heading"><span>COURSES</span><button className="icon-button" onClick={() => void addCourse()} title="Add course" aria-label="Add course"><Plus size={16} /></button></div>
      <div className="course-list">{visibleCourses.map((item) => <button key={item.id} className={`course-item ${course.id === item.id ? "selected" : ""}`} onClick={() => changeCourse(item)}><i style={{ background: item.color }} /><span><b>{item.title}</b><small>{item.code}</small></span><MoreHorizontal size={15} className="course-more" /></button>)}{hiddenCourseCount > 0 && <button className="tree-sub" data-testid="show-all-courses" onClick={() => setShowAllCourses(true)}>Show {hiddenCourseCount} more courses</button>}</div>
      {course.id ? <div className="course-tree"><div className="tree-course">{course.title}</div>{lessons.map((item) => <button key={item.id} className={`tree-sub ${lessonId === item.id ? "lesson-current" : ""}`} onClick={() => changeLesson(item.id)}>{lessonId === item.id && <span className="lesson-dot" />}{humanizeLessonTitle(item.title)}</button>)}<button className="tree-sub" onClick={() => void addLesson()}>+ Add lesson</button>{lessonError && <small role="alert">{lessonError}</small>}</div> : <div className="course-tree"><span>{courseError || (status === "No courses yet" ? "Add a course to begin." : "Loading courses…")}</span><button className="tree-sub" onClick={() => void addCourse()}>+ Add course</button></div>}
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setSettings(true)}><Settings2 size={17} /> Settings</button><div className="local-status"><span />{status}</div></div>
    </aside></>}

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumbs"><button className="icon-button" onClick={() => setSidebar(!sidebar)} title="Toggle courses"><Menu size={17} /></button><span>{course.title || "Study workspace"}</span>{lessonTitle && <><ChevronRight size={14} /><b>{lessonTitle}</b></>}</div>
        <div className="immersive-actions">
          <button aria-label="Open canvas workspace" data-testid="open-canvas" className={mode === "canvas" ? "primary" : ""} onClick={() => { setMode("canvas"); setView("Canvas"); }} title="Open canvas workspace"><Layers size={15} /> Canvas</button>
          <button className={mode === "study" ? "primary" : ""} data-testid="open-study" data-deemphasised={!surfaceHasWork.study} disabled={!course.id || !lessonId} onClick={() => setMode("study")} title="Open quizzes and flashcards"><Brain size={15} /> Study</button>
          <button className={mode === "studio" ? "primary" : ""} data-testid="open-studio" data-deemphasised={!surfaceHasWork.studio} disabled={!course.id || !lessonId} onClick={() => setMode("studio")} title="Open StudyAI Studio"><Sparkles size={15} /> Studio</button>
          <button className={mode === "concepts" ? "primary" : ""} data-testid="open-concept-graph" data-deemphasised={!surfaceHasWork.concepts} disabled={!course.id} onClick={() => setMode("concepts")} title="Open course concept graph"><Network size={15} /> Concepts</button>
        </div>
        <button type="button" className="surface-next-chip" data-testid="surface-next" data-target={nextSurface} title={`Next: ${surfaceLabels[nextSurface]}`} onClick={() => setMode(nextSurface)}><span>Next</span><b>{surfaceLabels[nextSurface]}</b><ChevronRight size={13} /></button>
        <div className="top-actions"><span className="saved"><span />{status}</span><button className="icon-button" onClick={() => setTutor(!tutor)} title="Toggle study tutor"><Sparkles size={15} /></button><button className="icon-button" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun size={17} /> : <Moon size={17} />}</button><button className="icon-button" onClick={() => setHelpOpen(true)} title="Help"><CircleHelp size={17} /></button><button className="icon-button" onClick={() => setSettings(true)} title="Settings"><Settings2 size={17} /></button></div>
      </header>
      {!course.id && <OneDropSurface onReady={(context) => void handleOneDropReady(context)} />}
      {course.id && lessonId && mode === "canvas" && coach.prompts.length > 0 && <TodayStrip prompts={coach.prompts} onPrepare={prepareCoachTarget} onStatus={setTodayNotice} onOpenToday={() => setMode("today")} />}
      <section className="lesson-header"><div><div className="eyebrow"><span className="eyebrow-icon"><Atom size={14} /></span>{course.title || "COURSE"}</div><h1>{lessonTitle || (course.id ? "Choose a lesson" : "Create a course")}</h1><select aria-label="Active lesson" tabIndex={-1} value={lessonId} disabled={!lessons.length} onChange={(event) => changeLesson(event.target.value)}>{lessons.map((item) => <option key={item.id} value={item.id}>{humanizeLessonTitle(item.title)}</option>)}</select><p>{lessonTitle ? `Study materials, notes, and canvas for ${lessonTitle}.` : lessonError || "Select or create a lesson to start studying."}</p></div><button className="button-soft" tabIndex={-1} disabled={!course.id || !lessonId} onClick={() => setMode("study")}><Brain size={15} /> Study this lesson</button></section>
      <section className="workspace-toolbar"><div className="view-switch">{(["Canvas", "Lecture", "Split"] as View[]).map((item) => <button key={item} className={view === item ? "current" : ""} onClick={() => setView(item)}>{item === "Canvas" ? <Layers size={14} /> : item === "Lecture" ? <BookOpen size={14} /> : <PanelRightOpen size={14} />}{item}</button>)}</div><div className="toolbar-actions">{studyReturn && <button className="tool-chip study-return" onClick={() => { setStudyReturn(false); setMode("study"); }}><ChevronLeft size={14} /> Back to study session</button>}<button className="tool-chip" disabled={!course.id || !lessonId} onClick={() => setActivityLibraryOpen(true)}><Activity size={14} /> Activities</button><button className="tool-chip active" disabled={!course.id || !lessonId} onClick={() => setNoteOpen(true)}><FileText size={14} /> Notes</button><button className="tool-chip" onClick={() => setScienceTool("chem")}><Atom size={14} /> Chemistry</button><button className="icon-button" onClick={() => setView("Lecture")} title="Open document library"><BookOpen size={16} /></button></div></section>
      <div className={`work-area ${view.toLowerCase()}`}>
        {<div className="canvas-pane" hidden={view === "Lecture"}><div className="pane-label"><span>STUDY CANVAS</span><span className="canvas-tip">Draw, diagram, connect ideas</span></div>{course.id && lessonId ? <div className="canvas-workspace"><CanvasStudio key={`${course.id}:${lessonId}`} courseId={course.id} lessonId={lessonId} theme={dark ? "dark" : "light"} onStatus={updateStatus} onOpenNote={openLinkedNote} onOpenDocument={openLinkedDocument} onSummary={updateCanvasSummary} onSelectedObject={updateSelectedObject} preferredBoardId={preferredBoardId} onBoardState={updateActivityCanvas} activityMode={Boolean(activeActivity)} focusCitation={canvasFocus} />{activeActivity && <Suspense fallback={<ModeSurfaceLoading />}><ActivityTaskPanel courseId={course.id} lessonId={lessonId} session={activeActivity} canvas={activityCanvasState} onClose={closeActivity} /></Suspense>}</div> : <div className="canvas-loading">{courseError || lessonError || (course.id ? "Add a lesson to create a canvas." : "Select or create a course to create a canvas.")}</div>}</div>}
        {(view === "Lecture" || view === "Split") && <div className="lecture-pane">{course.id && <Suspense fallback={<div>Loading course sources…</div>}><DocumentLibrary key={`${course.id}:${lessonId}`} courseId={course.id} lessonId={lessonId} initialDocumentId={openDocumentId} courses={visibleCourses} onCourseChange={(id) => { const selected = courses.find((item) => item.id === id); if (selected) changeCourse(selected); }} initialSourceRef={openSourceRef} initialSourceKey={openSourceKey} initialQuery={query} /></Suspense>}</div>}

      </div>
    </main>
    {tutor && <><div className="resize-handle" role="separator" aria-label="Resize tutor panel" aria-orientation="vertical" aria-valuemin={300} aria-valuemax={520} aria-valuenow={tutorWidth} aria-valuetext={`${tutorWidth} pixels`} tabIndex={0} onKeyDown={(event) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); setTutorWidth((width) => Math.min(520, width + 20)); }
      else if (event.key === "ArrowRight") { event.preventDefault(); setTutorWidth((width) => Math.max(300, width - 20)); }
      else if (event.key === "Home") { event.preventDefault(); setTutorWidth(300); }
      else if (event.key === "End") { event.preventDefault(); setTutorWidth(520); }
    }} onMouseDown={() => { dragRef.current = true; }} onMouseMove={changeWidth} onMouseUp={() => { dragRef.current = false; }} onMouseLeave={() => { dragRef.current = false; }} /><aside className="tutor-panel" style={{ width: tutorWidth }}><div className="tutor-header"><div className="tutor-title"><div className="tutor-avatar"><Sparkles size={15} /></div><span><b>Study tutor</b><small data-testid="tutor-provider-status"><i />{activeTutor}</small></span></div><div><button className="icon-button" title="Tutor options" onClick={() => setTutorMenuOpen(true)}><MoreHorizontal size={17} /></button><button className="icon-button" onClick={() => setTutor(false)} title="Close tutor"><PanelRightClose size={17} /></button></div></div>{tutorContextOpen && course.id && lessonId && <div className="tutor-context"><div className="context-label"><span>LESSON CONTEXT</span><button className="icon-button" onClick={() => setTutorContextOpen(false)} aria-label="Hide lesson context"><X size={13} /></button></div><div className="context-card"><div className="context-icon"><Atom size={15} /></div><span><b>{lessonTitle}</b><small>{course.title}</small></span></div>{selectedObject && <div className="context-card" data-testid="selected-object-context"><div className="context-icon"><Atom size={15} /></div><span><b>{selectedObject.name}</b><small>Selected canvas object</small></span></div>}<p>Responses distinguish course excerpts from general knowledge. Open cited pages and slides from the answer.</p></div>}{coach.surface}{tutorQuestion && tutorQuestion.courseId === course.id && tutorQuestion.lessonId === lessonId && <PreparedQuestion question={tutorQuestion.question} title={tutorQuestion.sourceTitle} sourceRef={tutorQuestion.sourceRef} onSend={sendPreparedQuestion} onOpenSource={openSource} />}{course.id && lessonId ? <div className="copilot-slot" onClick={openCitation}><CopilotChat className="study-chat" messageView={{ assistantMessage: { markdownRenderer: CustomMarkdownRenderer }, toolCallDisplay: "turn" }} inspectorTools={import.meta.env.DEV} labels={{ welcomeMessageText: `Ask about ${lessonTitle}, request a worked example, or ask about the canvas.` }} /></div> : <div className="copilot-slot"><div className="canvas-loading">Select or create a lesson to start tutoring.</div></div>}<div className="tutor-disclaimer"><Sparkles size={12} /> AI can make mistakes. Check important details against your sources.</div></aside></>}
    {!tutor && <button className="reopen-tutor" onClick={() => setTutor(true)}><Sparkles size={16} /> Open tutor</button>}
    {settings && <div className="modal-shade" onClick={() => setSettings(false)}><div ref={settingsRef} tabIndex={-1} className="settings-modal" role="dialog" aria-label="StudyAI settings" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">PREFERENCES</span><h2>StudyAI settings</h2></div><button className="icon-button" aria-label="Close settings" onClick={() => setSettings(false)}><X size={18} /></button></div><label data-testid="active-tutor-provider">Active tutor provider<input value={activeTutor} readOnly /></label><label>Local model service (Ollama)<input value={aiStatus} readOnly /></label><FreeKeyGuide /><label>Local model<select aria-label="Model" data-testid="model-select" value={selectedModel} disabled={!models.length} onChange={(e) => { setSelectedModel(e.target.value); localStorage.setItem("studyai.model", e.target.value); }}>{!models.length && <option value="">{aiStatus}</option>}{models.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><p data-testid="model-provider-note">{tutorStatus && !tutorStatus.pickerActive ? tutorStatus.note : models.length ? "This list is the local Ollama service. It applies only when the Study tutor runs on Ollama; otherwise the tutor uses the model configured for the active provider, which this list cannot change." : aiStatus}</p>{PAID_ENABLED && <><label>AI provider<select data-testid="credit-provider-option" value={creditProvider} onChange={(e) => { setCreditProvider(e.target.value); localStorage.setItem("studyai.credit.provider", e.target.value); }}><option value="local">Local / BYOK</option><option value="credits">StudyAI Credits</option></select></label>{creditProvider === "credits" && <div className="credits-panel"><p data-testid="credit-balance">Balance: ${(creditBalance / 1_000_000).toFixed(2)}</p><p data-testid="credit-recovery-code">{creditRecovery}</p><p data-testid="credit-disclosure">Your wallet lives in this browser only. Save the recovery code: without it a balance cannot be recovered.</p><label>Redeem code<input data-testid="credit-redeem-input" value={creditCode} onChange={(e) => setCreditCode(e.target.value)} /></label><button data-testid="credit-redeem-button" onClick={redeemCredit}>Redeem</button><label>Ask with credits<input data-testid="credit-chat-input" value={creditQuestion} onChange={(e) => setCreditQuestion(e.target.value)} /></label><button data-testid="credit-chat-send" onClick={sendCreditChat}>Send</button>{creditAnswer && <div data-testid="credit-chat-answer"><CustomMarkdownRenderer content={creditAnswer} /></div>}{creditStatus && <p>{creditStatus}</p>}</div>}<div className="credits-panel" data-testid="support-panel"><h3>Support StudyAI</h3><div className="science-tabs"><button data-testid="support-kind-donation" className={supportKind === "donation" ? "current" : ""} onClick={() => { setSupportKind("donation"); setSupportChoice("small"); }}>Donate</button><button data-testid="support-kind-credits" className={supportKind === "credits" ? "current" : ""} onClick={() => { setSupportKind("credits"); setSupportChoice("small"); }}>Buy credits</button></div><label>Amount<select data-testid="support-amount" value={supportChoice} onChange={(e) => setSupportChoice(e.target.value)}>{(supportKind === "donation" ? [["small", "$2"], ["medium", "$5"], ["large", "$10"]] : [["small", "$5"], ["medium", "$10"], ["large", "$20"]]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button data-testid="support-checkout-button" onClick={requestCheckout}>Continue to Stripe</button>{supportStatus && <p data-testid="support-status">{supportStatus}</p>}<p>Payments are processed by Stripe. Refunds are handled manually and credits are not revoked automatically.</p></div></>}<button className="button-primary" onClick={() => setSettings(false)}>Done</button></div></div>}
    {noteOpen && course.id && lessonId && <div className="modal-shade" onClick={() => setNoteOpen(false)}><div ref={noteDialogRef} tabIndex={-1} className="settings-modal notes-modal" role="dialog" aria-label="Lesson notes" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{course.title} · {lessonTitle}</span><input ref={noteTitleRef} aria-label="Note title" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} /></div><button className="icon-button" aria-label="Close notes" onClick={() => setNoteOpen(false)}><X size={18} /></button></div><textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write notes for this lesson…" /><p>Notes save automatically to the local SQLite database.</p><button className="button-primary" onClick={() => setNoteOpen(false)}>Done</button></div></div>}
    {scienceTool && <ScienceModal initial={scienceTool} close={() => setScienceTool(null)} />}
    {activityLibraryOpen && course.id && lessonId && <Suspense fallback={<ModeSurfaceLoading />}><ActivityLibrary courseId={course.id} lessonId={lessonId} onClose={() => setActivityLibraryOpen(false)} onStart={launchActivity} /></Suspense>}
    {tutorMenuOpen && <TutorMenu config={tutorConfig} onToggleContext={() => setTutorContextOpen(!tutorContextOpen)} onClose={() => setTutorMenuOpen(false)} />}
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} onOpenSettings={() => { setHelpOpen(false); setSettings(true); }} onOpenCanvas={() => { setHelpOpen(false); setView("Canvas"); }} />}
    {progressOpen && course.id && <ProgressDialog courseId={course.id} onClose={() => setProgressOpen(false)} />}
    {searchOpen && <SearchDialog courseId={course.id} onClose={() => setSearchOpen(false)} onOpen={(sourceRef) => { setOpenDocumentId(undefined); setOpenSourceRef(sourceRef); setOpenSourceKey((key) => key + 1); setView("Lecture"); setSearchOpen(false); }} />}
    {flashcardReviewOpen && course.id && lessonId && <Suspense fallback={<ModeSurfaceLoading />}><FlashcardReview courseId={course.id} lessonId={lessonId} lessonTitle={lessonTitle} close={() => setFlashcardReviewOpen(false)} /></Suspense>}
    {mode === "study" && course.id && lessonId && <Suspense fallback={<ModeSurfaceLoading />}><StudyStage courseId={course.id} lessonId={lessonId} courseTitle={course.title} lessonTitle={lessonTitle} close={() => setMode("canvas")} onOpenCards={() => setFlashcardReviewOpen(true)} onOpenActivities={() => { setStudyReturn(true); setMode("canvas"); setActivityLibraryOpen(true); }} onOpenSources={() => { setStudyReturn(true); setMode("canvas"); setView("Lecture"); }} onOpenSource={(sourceRef) => { setOpenDocumentId(undefined); setOpenSourceRef(sourceRef); setOpenSourceKey((key) => key + 1); setMode("canvas"); setView("Lecture"); }} /></Suspense>}
    {mode === "concepts" && course.id && <Suspense fallback={<ModeSurfaceLoading />}><ConceptGraphView courseId={course.id} courseTitle={course.title}
      close={() => setMode("canvas")}
      onOpenSource={(sourceRef) => { setOpenDocumentId(undefined); setOpenSourceRef(sourceRef); setOpenSourceKey((key) => key + 1); setMode("canvas"); setView("Lecture"); }}
      onPractice={(node) => {
        void prepareCoachTarget({ courseId: course.id, lessonId: node.lessonId ?? "", destination: "study", conceptId: node.id, reason: `Practice ${node.label}`, focus: node.label })
          .then((result) => { if (!result.prepared) setStatus(result.message || `No reviewed question is available for ${node.label} right now.`); });
      }} /></Suspense>}
    {mode === "studio" && course.id && lessonId && <Suspense fallback={<ModeSurfaceLoading />}><StudioSurface courseId={course.id} lessonId={lessonId} courseTitle={course.title} lessonTitle={lessonTitle} initialFocus={coachFocus} initialArtifactId={initialArtifactId} initialDeckId={initialDeckId} close={() => { setMode("canvas"); setCoachFocus(""); setInitialArtifactId(undefined); setInitialDeckId(undefined); }} onOpenSource={(sourceRef) => { setOpenDocumentId(undefined); setOpenSourceRef(sourceRef); setOpenSourceKey((key) => key + 1); setMode("canvas"); setView("Lecture"); }} /></Suspense>}
    {mode === "home" && course.id && <HomeSurface courseId={course.id} lessonId={lessonId} courseTitle={course.title} lessonTitle={lessonTitle} prompts={coach.prompts} onPrepare={prepareCoachTarget} onStatus={setTodayNotice} onOpenSource={openSource} onRefresh={() => coach.refresh()} onOpenLibrary={() => { setMode("canvas"); setView("Lecture"); }} onGoToday={() => setMode("today")} close={() => setMode("canvas")} />}
    {mode === "today" && course.id && <TodaySurface prompts={coach.prompts} courseId={course.id} lessonId={lessonId} courseTitle={course.title} lessonTitle={lessonTitle} onPrepare={prepareCoachTarget} onStatus={setTodayNotice} onOpenSource={openSource} onStartQuestion={() => setMode("study")} close={() => setMode("canvas")} />}
    {todayNotice && <div className="today-notice" data-testid="today-status" role="status">{todayNotice}<button type="button" aria-label="Dismiss status" onClick={() => setTodayNotice("")}><X size={14} /></button></div>}
  </div></>;
}

export default function App() {
  const [mathResult, setMathResult] = useState<MathResult | null>(null);
  return <CopilotKitProvider runtimeUrl="/api/copilotkit" agentId="studyai" enableInspector={false}><Suspense fallback={null}><VegaChartToolRenderer /></Suspense><MathEvaluationTool onResult={setMathResult} /><MathResultCard result={mathResult} /><CopilotChatConfigurationProvider><Workspace /></CopilotChatConfigurationProvider></CopilotKitProvider>;
}

function AgentContext({ course, canvas, view, model, lessonId, lessonTitle }: { lessonId: string; lessonTitle: string; course: Course; canvas: { objectCount: number; objectTypes: Record<string, number> }; view: View; model: string }) {
  useAgentContext({ description: "StudyAI current workspace and structured canvas metadata", value: { courseId: course.id, lessonId, course: course.title, courseCode: course.code, lesson: lessonTitle, view, canvas } });

  useAgentContext({ description: "StudyAI selected model", value: { model } });
  return null;
}

function ScienceModal({ initial, close }: { initial: "chem" | "kin"; close: () => void }) {
  const scienceRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, scienceRef);
  const [tool, setTool] = useState(initial);
  const [element, setElement] = useState<Element>("O");
  const [lone, setLone] = useState(4);
  const [bonds, setBonds] = useState(2);
  const [vector, setVector] = useState<[number, number, number]>([3, 4, 0]);
  const charge = formalCharge(element, Number(lone), Number(bonds));
  return <div className="modal-shade" onClick={close}><div ref={scienceRef} tabIndex={-1} className="settings-modal science-modal" role="dialog" aria-label="Scientific tools" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">SCIENTIFIC TOOLS</span><h2>{tool === "chem" ? "Formal charge" : "Vector calculator"}</h2></div><button className="icon-button" aria-label="Close scientific tools" onClick={close}><X size={18} /></button></div><div className="science-tabs"><button className={tool === "chem" ? "current" : ""} onClick={() => setTool("chem")}>CHEM 120</button><button className={tool === "kin" ? "current" : ""} onClick={() => setTool("kin")}>KIN 120</button></div>{tool === "chem" ? <><p className="science-help">Formal charge = valence electrons − nonbonding electrons − bond order sum.</p><label>Element<select value={element} onChange={(e) => setElement(e.target.value as Element)}>{["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"].map((item) => <option key={item}>{item}</option>)}</select></label><div className="science-grid"><label>Nonbonding electrons<input type="number" min="0" value={lone} onChange={(e) => setLone(Number(e.target.value))} /></label><label>Bond order sum<input type="number" min="0" step="0.5" value={bonds} onChange={(e) => setBonds(Number(e.target.value))} /></label></div><div className="science-result">Formal charge <b>{charge > 0 ? `+${charge}` : charge}</b></div></> : <><p className="science-help">Enter a vector to calculate magnitude. Values are treated as x, y, and z components.</p><div className="science-grid">{vector.map((value, i) => <label key={i}>{["x", "y", "z"][i]} component<input type="number" value={value} onChange={(e) => setVector(vector.map((v, j) => i === j ? Number(e.target.value) : v) as [number, number, number])} /></label>)}</div><div className="science-result">Magnitude <b>{vectorMagnitude(...vector).toFixed(3)}</b></div><div className="science-result">Dot with unit x <b>{vectorDot(vector, [1, 0, 0])}</b></div></>}<button className="button-primary science-done" onClick={close}>Done</button></div></div>;
}
