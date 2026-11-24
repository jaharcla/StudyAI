import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CopilotChat, CopilotChatConfigurationProvider, CopilotKitProvider, useAgentContext, useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { Activity, Atom, BookOpen, Brain, ChevronLeft, ChevronRight, CircleHelp, FileText, GraduationCap, Layers, Menu, Moon, MoreHorizontal, Network, PanelRightClose, PanelRightOpen, Plus, Search, Settings2, Sparkles, Sun, X } from "lucide-react";
import { formalCharge, vectorDot, vectorMagnitude, type Element } from "./science";
import { CanvasStudio } from "./canvas/CanvasStudio";
import { parseSourceReference } from "./components/document-intelligence/api";
import { StudyPanel } from "./learning/StudyPanel";
import FlashcardReview from "./learning/FlashcardReview";
import { ActivityLibrary, type ActivitySession } from "./learning/ActivityLibrary";
import { ActivityTaskPanel } from "./learning/ActivityTaskPanel";
import { lessonPreferenceKey, selectCourse, selectLesson } from "./workspace-state";
import FreeKeyGuide from "./FreeKeyGuide";
import StudyStage from "./lab/StudyStage";
import StudioSurface from "./studio/StudioSurface";
import ConceptGraphView from "./studio/ConceptGraphView";
import ArtifactsPage from "./artifacts/ArtifactsPage";
import SearchDialog from "./components/SearchDialog";
import ProgressDialog from "./components/ProgressDialog";
import HelpDialog from "./components/HelpDialog";
import TutorMenu from "./components/TutorMenu";
const DocumentLibrary = lazy(() => import("./components/document-intelligence").then((module) => ({ default: module.DocumentLibrary })));


import { API, CREDITS_API } from "./api";
import { Streamdown, defaultRemarkPlugins, defaultRehypePlugins } from "streamdown";
import { useCoach } from "./coach/useCoach";
import { recommendationProducer } from "./coach/recommendationProducer";
import { registerCoachProducer } from "./coach/service";
import type { CoachTarget } from "./coach/contract";

// Paid rail is dormant (PRODUCT_ROADMAP, 2026-11-23). Off unless explicitly enabled.
const PAID_ENABLED = import.meta.env.VITE_STUDYAI_PAID_ENABLED === "1";
// Features only register producers; the Coach surface and activation live in src/coach.
registerCoachProducer(recommendationProducer);
import "katex/dist/katex.min.css";

type Course = { id: string; title: string; code: string; color: string };
type View = "Canvas" | "Lecture" | "Split";
type Lesson = { id: string; title: string };
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
  const [mode, setMode] = useState<"canvas" | "study" | "studio" | "artifacts" | "concepts">("canvas");
  const [sidebar, setSidebar] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tutorMenuOpen, setTutorMenuOpen] = useState(false);
  const [flashcardReviewOpen, setFlashcardReviewOpen] = useState(false);
  const tutorConfig = useCopilotChatConfiguration();
  const tutorScope = useRef("");
  useEffect(() => {
    const next = `${course.id}:${lessonId}`;
    if (tutorScope.current && tutorScope.current !== next) tutorConfig?.startNewThread();
    tutorScope.current = next;
  }, [course.id, lessonId, tutorConfig]);
  const [tutor, setTutor] = useState(true);
  const [showAllCourses, setShowAllCourses] = useState(false);
  const flooded = courses.length > generatedCourseFlood && !showAllCourses;
  const visibleCourses = flooded ? courses.filter((item) => !generatedCourseId.test(item.id)) : courses;
  const hiddenCourseCount = courses.length - visibleCourses.length;
  const [dark, setDark] = useState(false);
  const [settings, setSettings] = useState(false);
  const [models, setModels] = useState<Array<{ name: string; size: number }>>([]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("studyai.model") ?? "");
  const [aiStatus, setAiStatus] = useState("Checking Ollamaâ€¦");
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
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteId, setNoteId] = useState<string>();
  const [noteLoadedFor, setNoteLoadedFor] = useState("");
  const [scienceTool, setScienceTool] = useState<"chem" | "kin" | null>(null);
  const [studyOpen, setStudyOpen] = useState(false);
  const [activityLibraryOpen, setActivityLibraryOpen] = useState(false);
  const [activeActivity, setActiveActivity] = useState<ActivitySession | null>(null);
  const [preferredBoardId, setPreferredBoardId] = useState<string>();
  const [activityCanvasState, setActivityCanvasState] = useState<{ id: string; revision: number; saved: boolean } | null>(null);
  const [coachFocus, setCoachFocus] = useState("");
  const [tutorContextOpen, setTutorContextOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Connecting to local storageâ€¦");
  const [tutorWidth, setTutorWidth] = useState(360);
  const [openDocumentId, setOpenDocumentId] = useState<string>();
  const [openSourceRef, setOpenSourceRef] = useState<string>();
  const [openSourceKey, setOpenSourceKey] = useState(0);
  const dragRef = useRef(false);
  const [canvasSummary, setCanvasSummary] = useState({ objectCount: 0, objectTypes: {} as Record<string, number> });
  const updateCanvasSummary = useCallback((summary: { objectCount: number; objectTypes: Record<string, number> }) => setCanvasSummary(summary), []);
  const [selectedObject, setSelectedObject] = useState<{ id: string; name: string } | null>(null);
  const updateSelectedObject = useCallback((object: { id: string; name: string } | null) => setSelectedObject(object), []);
  const updateStatus = useCallback((next: string) => setStatus(next), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen((open) => !open); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  const prepareCoachTarget = useCallback(async (target: CoachTarget): Promise<boolean> => {
    if (!target.courseId || !target.lessonId) return false;
    if (target.courseId !== course.id) {
      const next = courses.find((item) => item.id === target.courseId);
      if (!next) return false;
      setCourse(next);
      localStorage.setItem("studyai.course", next.id);
      localStorage.setItem(lessonPreferenceKey(next.id), target.lessonId);
      setLessonId(target.lessonId);
    } else if (target.lessonId !== lessonId) {
      if (!lessons.some((item) => item.id === target.lessonId)) return false;
      setLessonId(target.lessonId);
      localStorage.setItem(lessonPreferenceKey(course.id), target.lessonId);
    }
    const scope = `course=${encodeURIComponent(target.courseId)}&lesson=${encodeURIComponent(target.lessonId)}`;
    if (target.destination === "study") {
      const focused = target.conceptId ? `&concept=${encodeURIComponent(target.conceptId)}` : "";
      const response = await fetch(`${API}/study/ask?${scope}${focused}`);
      if (!response.ok) return false;
      setMode("study");
      return true;
    }
    if (target.destination === "board") {
      if (!target.boardId) return false;
      const response = await fetch(`${API}/canvases/${encodeURIComponent(target.boardId)}?${scope}`);
      if (!response.ok) return false;
      setPreferredBoardId(target.boardId);
      setView("Canvas");
      setMode("canvas");
      return true;
    }
    setCoachFocus(target.focus ?? "");
    setMode("studio");
    return true;
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
      setAiStatus(available.length ? "Ollama connected" : "Ollama connected Â· no models installed");
      setSelectedModel((current) => {
        const next = available.some((item) => item.name === current) ? current : available.some((item) => item.name === data.configuredModel) ? data.configuredModel : (available[0]?.name ?? "");
        if (next) localStorage.setItem("studyai.model", next); else localStorage.removeItem("studyai.model");
        return next;
      });
    }).catch((error) => { if (live) { setModels([]); setSelectedModel(""); localStorage.removeItem("studyai.model"); setAiStatus(error instanceof Error ? error.message : "Ollama is unavailable"); } });
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
      setSupportStatus("Continuing to Stripe to complete paymentâ€¦");
      window.location.href = data.url;
    } catch (error) {
      setSupportStatus(error instanceof Error ? error.message : "Checkout is unavailable right now.");
    }
  }, [supportKind, supportChoice, creditHeaders]);

  useEffect(() => {
    if (PAID_ENABLED && new URLSearchParams(window.location.search).get("checkout") === "success") {
      setSupportStatus("Payment received â€” credits may take a moment to appear.");
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
      setStatus("Saving noteâ€¦");
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

  const changeCourse = (next: Course) => {
    setSidebar(false);
    if (next.id === course.id) return;
    closeActivity(); setActivityLibraryOpen(false);
    setCourse(next);
    setLessons([]);
    setLessonId("");
    setStatus("Loading courseâ€¦");
    localStorage.setItem("studyai.course", next.id);
  };

  const changeLesson = (nextId: string) => {
    setSidebar(false);
    closeActivity(); setActivityLibraryOpen(false);
    setLessonId(nextId);
    setStatus("Loading lessonâ€¦");
    if (course.id) localStorage.setItem(lessonPreferenceKey(course.id), nextId);
  };

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


  return <>{course.id && lessonId && <AgentContext course={course} canvas={canvasSummary} view={view} model={selectedModel} lessonId={lessonId} lessonTitle={lessonTitle} />}<div className={`app-shell view-${view.toLowerCase()} ${dark ? "dark" : ""} ${sidebar ? "sidebar-open" : ""} ${tutor ? "tutor-open" : ""}`} style={{ "--tutor-width": `${tutorWidth}px` } as React.CSSProperties}>
    {sidebar && <><div className="sidebar-scrim" onClick={() => setSidebar(false)} /><aside className="sidebar">
      <div className="brand-row"><div className="brand-mark"><Sparkles size={17} /></div><span>study<span className="brand-ai">ai</span></span><button className="icon-button sidebar-close" onClick={() => setSidebar(false)} title="Collapse sidebar"><ChevronLeft size={16} /></button></div>
      <button className="search-button" onClick={() => setSearchOpen(true)} title="Search anything"><Search size={15} /><span>Search anything</span><kbd>âŒ˜ K</kbd></button>
      <div className="nav-label">YOUR SPACE</div>
      <button className="nav-item active"><GraduationCap size={17} /> Study workspace</button>
      <button className="nav-item" onClick={() => setProgressOpen(true)}><Activity size={17} /> Learning progress</button>
      <div className="course-heading"><span>COURSES</span><button className="icon-button" onClick={() => void addCourse()} title="Add course" aria-label="Add course"><Plus size={16} /></button></div>
      <div className="course-list">{visibleCourses.map((item) => <button key={item.id} className={`course-item ${course.id === item.id ? "selected" : ""}`} onClick={() => changeCourse(item)}><i style={{ background: item.color }} /><span><b>{item.title}</b><small>{item.code}</small></span><MoreHorizontal size={15} className="course-more" /></button>)}{hiddenCourseCount > 0 && <button className="tree-sub" data-testid="show-all-courses" onClick={() => setShowAllCourses(true)}>Show {hiddenCourseCount} more courses</button>}</div>
      {course.id ? <div className="course-tree"><div className="tree-course">{course.title}</div>{lessons.map((item) => <button key={item.id} className={`tree-sub ${lessonId === item.id ? "lesson-current" : ""}`} onClick={() => changeLesson(item.id)}>{lessonId === item.id && <span className="lesson-dot" />}{humanizeLessonTitle(item.title)}</button>)}<button className="tree-sub" onClick={() => void addLesson()}>+ Add lesson</button>{lessonError && <small role="alert">{lessonError}</small>}</div> : <div className="course-tree"><span>{courseError || (status === "No courses yet" ? "Add a course to begin." : "Loading coursesâ€¦")}</span><button className="tree-sub" onClick={() => void addCourse()}>+ Add course</button></div>}
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setSettings(true)}><Settings2 size={17} /> Settings</button><div className="local-status"><span />{status}</div></div>
    </aside></>}

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumbs"><button className="icon-button" onClick={() => setSidebar(!sidebar)} title="Toggle courses"><Menu size={17} /></button><span>{course.title || "Study workspace"}</span>{lessonTitle && <><ChevronRight size={14} /><b>{lessonTitle}</b></>}</div>
        <div className="immersive-actions">
          <button disabled={!course.id} data-testid="open-concept-graph" onClick={() => setMode("concepts")} title="Open course concept graph"><Network size={15} /> Concepts</button>
          <button className="primary" disabled={!course.id || !lessonId} onClick={() => setMode("studio")} title="Open StudyAI Studio"><Sparkles size={15} /> Studio</button>
          <button disabled={!course.id || !lessonId} onClick={() => setMode("artifacts")} title="Open Artifacts"><Layers size={15} /> Artifacts</button>
          <button disabled={!course.id || !lessonId} onClick={() => setMode("study")} title="Open quizzes and flashcards"><Brain size={15} /> Study</button>
          <button disabled={!course.id || !lessonId} onClick={() => setFlashcardReviewOpen(true)} title="Flashcards and review"><BookOpen size={14} /> Cards</button>
          <button className="icon-only" onClick={() => setTutor(!tutor)} title="Toggle study tutor"><Sparkles size={15} /></button>
        </div>
        <div className="top-actions"><span className="saved"><span />{status}</span><button className="icon-button" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun size={17} /> : <Moon size={17} />}</button><button className="icon-button" onClick={() => setHelpOpen(true)} title="Help"><CircleHelp size={17} /></button><button className="icon-button" onClick={() => setSettings(true)} title="Settings"><Settings2 size={17} /></button></div>
      </header>
      <section className="lesson-header"><div><div className="eyebrow"><span className="eyebrow-icon"><Atom size={14} /></span>{course.title || "COURSE"}</div><h1>{lessonTitle || (course.id ? "Choose a lesson" : "Create a course")}</h1><select aria-label="Active lesson" value={lessonId} disabled={!lessons.length} onChange={(event) => changeLesson(event.target.value)}>{lessons.map((item) => <option key={item.id} value={item.id}>{humanizeLessonTitle(item.title)}</option>)}</select><p>{lessonTitle ? `Study materials, notes, and canvas for ${lessonTitle}.` : lessonError || "Select or create a lesson to start studying."}</p></div><button className="button-soft" disabled={!course.id || !lessonId} onClick={() => setStudyOpen(true)}><Brain size={15} /> Study this lesson</button></section>
      <section className="workspace-toolbar"><div className="view-switch">{(["Canvas", "Lecture", "Split"] as View[]).map((item) => <button key={item} className={view === item ? "current" : ""} onClick={() => setView(item)}>{item === "Canvas" ? <Layers size={14} /> : item === "Lecture" ? <BookOpen size={14} /> : <PanelRightOpen size={14} />}{item}</button>)}</div><div className="toolbar-actions"><button className="tool-chip" disabled={!course.id || !lessonId} onClick={() => setActivityLibraryOpen(true)}><Activity size={14} /> Activities</button><button className="tool-chip active" disabled={!course.id || !lessonId} onClick={() => setNoteOpen(true)}><FileText size={14} /> Notes</button><button className="tool-chip" onClick={() => setScienceTool("chem")}><Atom size={14} /> Chemistry</button><button className="icon-button" onClick={() => setView("Lecture")} title="Open document library"><BookOpen size={16} /></button></div></section>
      <div className={`work-area ${view.toLowerCase()}`}>
        {<div className="canvas-pane" hidden={view === "Lecture"}><div className="pane-label"><span>STUDY CANVAS</span><span className="canvas-tip">Draw, diagram, connect ideas</span></div>{course.id && lessonId ? <div className="canvas-workspace"><CanvasStudio key={`${course.id}:${lessonId}`} courseId={course.id} lessonId={lessonId} theme={dark ? "dark" : "light"} onStatus={updateStatus} onOpenNote={openLinkedNote} onOpenDocument={openLinkedDocument} onSummary={updateCanvasSummary} onSelectedObject={updateSelectedObject} preferredBoardId={preferredBoardId} onBoardState={updateActivityCanvas} activityMode={Boolean(activeActivity)} />{activeActivity && <ActivityTaskPanel courseId={course.id} lessonId={lessonId} session={activeActivity} canvas={activityCanvasState} onClose={closeActivity} />}</div> : <div className="canvas-loading">{courseError || lessonError || (course.id ? "Add a lesson to create a canvas." : "Select or create a course to create a canvas.")}</div>}</div>}
        {(view === "Lecture" || view === "Split") && <div className="lecture-pane">{course.id && <Suspense fallback={<div>Loading course sourcesâ€¦</div>}><DocumentLibrary key={`${course.id}:${lessonId}`} courseId={course.id} lessonId={lessonId} initialDocumentId={openDocumentId} courses={visibleCourses} onCourseChange={(id) => { const selected = courses.find((item) => item.id === id); if (selected) changeCourse(selected); }} initialSourceRef={openSourceRef} initialSourceKey={openSourceKey} initialQuery={query} /></Suspense>}</div>}

      </div>
    </main>
    {tutor && <><div className="resize-handle" role="separator" aria-label="Resize tutor panel" aria-orientation="vertical" aria-valuemin={300} aria-valuemax={520} aria-valuenow={tutorWidth} aria-valuetext={`${tutorWidth} pixels`} tabIndex={0} onKeyDown={(event) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); setTutorWidth((width) => Math.min(520, width + 20)); }
      else if (event.key === "ArrowRight") { event.preventDefault(); setTutorWidth((width) => Math.max(300, width - 20)); }
      else if (event.key === "Home") { event.preventDefault(); setTutorWidth(300); }
      else if (event.key === "End") { event.preventDefault(); setTutorWidth(520); }
    }} onMouseDown={() => { dragRef.current = true; }} onMouseMove={changeWidth} onMouseUp={() => { dragRef.current = false; }} onMouseLeave={() => { dragRef.current = false; }} /><aside className="tutor-panel" style={{ width: tutorWidth }}><div className="tutor-header"><div className="tutor-title"><div className="tutor-avatar"><Sparkles size={15} /></div><span><b>Study tutor</b><small><i />{aiStatus}</small></span></div><div><button className="icon-button" title="Tutor options" onClick={() => setTutorMenuOpen(true)}><MoreHorizontal size={17} /></button><button className="icon-button" onClick={() => setTutor(false)} title="Close tutor"><PanelRightClose size={17} /></button></div></div>{tutorContextOpen && course.id && lessonId && <div className="tutor-context"><div className="context-label"><span>LESSON CONTEXT</span><button className="icon-button" onClick={() => setTutorContextOpen(false)} aria-label="Hide lesson context"><X size={13} /></button></div><div className="context-card"><div className="context-icon"><Atom size={15} /></div><span><b>{lessonTitle}</b><small>{course.title}</small></span></div>{selectedObject && <div className="context-card" data-testid="selected-object-context"><div className="context-icon"><Atom size={15} /></div><span><b>{selectedObject.name}</b><small>Selected canvas object</small></span></div>}<p>Responses distinguish course excerpts from general knowledge. Open cited pages and slides from the answer.</p></div>}{course.id && lessonId ? <div className="copilot-slot" onClick={openCitation}><CopilotChat className="study-chat" messageView={{ assistantMessage: { markdownRenderer: CustomMarkdownRenderer }, toolCallDisplay: "turn" }} inspectorTools={import.meta.env.DEV} labels={{ welcomeMessageText: `Ask about ${lessonTitle}, request a worked example, or ask about the canvas.` }} /></div> : <div className="copilot-slot"><div className="canvas-loading">Select or create a lesson to start tutoring.</div></div>}<div className="tutor-disclaimer"><Sparkles size={12} /> AI can make mistakes. Check important details against your sources.</div></aside></>}
    {!tutor && <button className="reopen-tutor" onClick={() => setTutor(true)}><Sparkles size={16} /> Open tutor</button>}
    {settings && <div className="modal-shade" onClick={() => setSettings(false)}><div className="settings-modal" role="dialog" aria-label="StudyAI settings" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">PREFERENCES</span><h2>StudyAI settings</h2></div><button className="icon-button" onClick={() => setSettings(false)}><X size={18} /></button></div><label>Local model service (Ollama)<input value={aiStatus} readOnly /></label><FreeKeyGuide /><label>Local model<select aria-label="Model" data-testid="model-select" value={selectedModel} disabled={!models.length} onChange={(e) => { setSelectedModel(e.target.value); localStorage.setItem("studyai.model", e.target.value); }}>{!models.length && <option value="">{aiStatus}</option>}{models.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><p data-testid="model-provider-note">{models.length ? "This list is the local Ollama service. It applies only when the Study tutor runs on Ollama; otherwise the tutor uses the model configured for the active provider, which this list cannot change." : aiStatus}</p>{PAID_ENABLED && <><label>AI provider<select data-testid="credit-provider-option" value={creditProvider} onChange={(e) => { setCreditProvider(e.target.value); localStorage.setItem("studyai.credit.provider", e.target.value); }}><option value="local">Local / BYOK</option><option value="credits">StudyAI Credits</option></select></label>{creditProvider === "credits" && <div className="credits-panel"><p data-testid="credit-balance">Balance: ${(creditBalance / 1_000_000).toFixed(2)}</p><p data-testid="credit-recovery-code">{creditRecovery}</p><p data-testid="credit-disclosure">Your wallet lives in this browser only. Save the recovery code: without it a balance cannot be recovered.</p><label>Redeem code<input data-testid="credit-redeem-input" value={creditCode} onChange={(e) => setCreditCode(e.target.value)} /></label><button data-testid="credit-redeem-button" onClick={redeemCredit}>Redeem</button><label>Ask with credits<input data-testid="credit-chat-input" value={creditQuestion} onChange={(e) => setCreditQuestion(e.target.value)} /></label><button data-testid="credit-chat-send" onClick={sendCreditChat}>Send</button>{creditAnswer && <div data-testid="credit-chat-answer"><CustomMarkdownRenderer content={creditAnswer} /></div>}{creditStatus && <p>{creditStatus}</p>}</div>}<div className="credits-panel" data-testid="support-panel"><h3>Support StudyAI</h3><div className="science-tabs"><button data-testid="support-kind-donation" className={supportKind === "donation" ? "current" : ""} onClick={() => { setSupportKind("donation"); setSupportChoice("small"); }}>Donate</button><button data-testid="support-kind-credits" className={supportKind === "credits" ? "current" : ""} onClick={() => { setSupportKind("credits"); setSupportChoice("small"); }}>Buy credits</button></div><label>Amount<select data-testid="support-amount" value={supportChoice} onChange={(e) => setSupportChoice(e.target.value)}>{(supportKind === "donation" ? [["small", "$2"], ["medium", "$5"], ["large", "$10"]] : [["small", "$5"], ["medium", "$10"], ["large", "$20"]]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button data-testid="support-checkout-button" onClick={requestCheckout}>Continue to Stripe</button>{supportStatus && <p data-testid="support-status">{supportStatus}</p>}<p>Payments are processed by Stripe. Refunds are handled manually and credits are not revoked automatically.</p></div></>}<button className="button-primary" onClick={() => setSettings(false)}>Done</button></div></div>}
    {noteOpen && course.id && lessonId && <div className="modal-shade" onClick={() => setNoteOpen(false)}><div className="settings-modal notes-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{course.title} Â· {lessonTitle}</span><input aria-label="Note title" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} /></div><button className="icon-button" onClick={() => setNoteOpen(false)}><X size={18} /></button></div><textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write notes for this lessonâ€¦" /><p>Notes save automatically to the local SQLite database.</p><button className="button-primary" onClick={() => setNoteOpen(false)}>Done</button></div></div>}
    {scienceTool && <ScienceModal initial={scienceTool} close={() => setScienceTool(null)} />}
    {activityLibraryOpen && course.id && lessonId && <ActivityLibrary courseId={course.id} lessonId={lessonId} onClose={() => setActivityLibraryOpen(false)} onStart={launchActivity} />}
    {studyOpen && course.id && lessonId && <StudyPanel courseId={course.id} lessonId={lessonId} close={() => setStudyOpen(false)} />}
    {tutorMenuOpen && <TutorMenu config={tutorConfig} onToggleContext={() => setTutorContextOpen(!tutorContextOpen)} onClose={() => setTutorMenuOpen(false)} />}
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} onOpenSettings={() => { setHelpOpen(false); setSettings(true); }} onOpenCanvas={() => { setHelpOpen(false); setView("Canvas"); }} />}
    {progressOpen && course.id && <ProgressDialog courseId={course.id} onClose={() => setProgressOpen(false)} />}
    {searchOpen && <SearchDialog courseId={course.id} onClose={() => setSearchOpen(false)} onOpen={(sourceRef) => { setOpenDocumentId(undefined); setOpenSourceRef(sourceRef); setOpenSourceKey((key) => key + 1); setView("Lecture"); setSearchOpen(false); }} />}
    {flashcardReviewOpen && course.id && lessonId && <FlashcardReview courseId={course.id} lessonId={lessonId} close={() => setFlashcardReviewOpen(false)} />}
    {mode === "study" && course.id && lessonId && <StudyStage courseId={course.id} lessonId={lessonId} courseTitle={course.title} lessonTitle={lessonTitle} close={() => setMode("canvas")} onOpenActivities={() => { setMode("canvas"); setActivityLibraryOpen(true); }} onOpenSources={() => { setMode("canvas"); setView("Lecture"); }} />}
    {mode === "concepts" && course.id && <ConceptGraphView courseId={course.id} courseTitle={course.title}
      close={() => setMode("canvas")}
      onOpenSource={(sourceRef) => { setOpenDocumentId(undefined); setOpenSourceRef(sourceRef); setOpenSourceKey((key) => key + 1); setMode("canvas"); setView("Lecture"); }}
      onPractice={(node) => {
        void prepareCoachTarget({ courseId: course.id, lessonId: node.lessonId ?? "", destination: "study", conceptId: node.id, reason: `Practice ${node.label}`, focus: node.label })
          .then((prepared) => { if (!prepared) setStatus(`No reviewed question is available for ${node.label} right now.`); });
      }} />}
    {mode === "studio" && course.id && lessonId && <StudioSurface courseId={course.id} lessonId={lessonId} courseTitle={course.title} lessonTitle={lessonTitle} initialFocus={coachFocus} close={() => { setMode("canvas"); setCoachFocus(""); }} onOpenSource={(sourceRef) => { setOpenDocumentId(undefined); setOpenSourceRef(sourceRef); setOpenSourceKey((key) => key + 1); setMode("canvas"); setView("Lecture"); }} />}
    {mode === "artifacts" && course.id && lessonId && <ArtifactsPage courseId={course.id} lessonId={lessonId} courseTitle={course.title} lessonTitle={lessonTitle} close={() => setMode("canvas")} onOpenSource={(sourceRef) => { setOpenDocumentId(undefined); setOpenSourceRef(sourceRef); setOpenSourceKey((key) => key + 1); setMode("canvas"); setView("Lecture"); }} />}
    {coach.surface}
  </div></>;
}

export default function App() { return <CopilotKitProvider runtimeUrl="/api/copilotkit" agentId="studyai" enableInspector={false}><CopilotChatConfigurationProvider><Workspace /></CopilotChatConfigurationProvider></CopilotKitProvider>; }

function AgentContext({ course, canvas, view, model, lessonId, lessonTitle }: { lessonId: string; lessonTitle: string; course: Course; canvas: { objectCount: number; objectTypes: Record<string, number> }; view: View; model: string }) {
  useAgentContext({ description: "StudyAI current workspace and structured canvas metadata", value: { courseId: course.id, lessonId, course: course.title, courseCode: course.code, lesson: lessonTitle, view, canvas } });

  useAgentContext({ description: "StudyAI selected model", value: { model } });
  return null;
}

function ScienceModal({ initial, close }: { initial: "chem" | "kin"; close: () => void }) {
  const [tool, setTool] = useState(initial);
  const [element, setElement] = useState<Element>("O");
  const [lone, setLone] = useState(4);
  const [bonds, setBonds] = useState(2);
  const [vector, setVector] = useState<[number, number, number]>([3, 4, 0]);
  const charge = formalCharge(element, Number(lone), Number(bonds));
  return <div className="modal-shade" onClick={close}><div className="settings-modal science-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">SCIENTIFIC TOOLS</span><h2>{tool === "chem" ? "Formal charge" : "Vector calculator"}</h2></div><button className="icon-button" onClick={close}><X size={18} /></button></div><div className="science-tabs"><button className={tool === "chem" ? "current" : ""} onClick={() => setTool("chem")}>CHEM 120</button><button className={tool === "kin" ? "current" : ""} onClick={() => setTool("kin")}>KIN 120</button></div>{tool === "chem" ? <><p className="science-help">Formal charge = valence electrons âˆ’ nonbonding electrons âˆ’ bond order sum.</p><label>Element<select value={element} onChange={(e) => setElement(e.target.value as Element)}>{["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"].map((item) => <option key={item}>{item}</option>)}</select></label><div className="science-grid"><label>Nonbonding electrons<input type="number" min="0" value={lone} onChange={(e) => setLone(Number(e.target.value))} /></label><label>Bond order sum<input type="number" min="0" step="0.5" value={bonds} onChange={(e) => setBonds(Number(e.target.value))} /></label></div><div className="science-result">Formal charge <b>{charge > 0 ? `+${charge}` : charge}</b></div></> : <><p className="science-help">Enter a vector to calculate magnitude. Values are treated as x, y, and z components.</p><div className="science-grid">{vector.map((value, i) => <label key={i}>{["x", "y", "z"][i]} component<input type="number" value={value} onChange={(e) => setVector(vector.map((v, j) => i === j ? Number(e.target.value) : v) as [number, number, number])} /></label>)}</div><div className="science-result">Magnitude <b>{vectorMagnitude(...vector).toFixed(3)}</b></div><div className="science-result">Dot with unit x <b>{vectorDot(vector, [1, 0, 0])}</b></div></>}<button className="button-primary science-done" onClick={close}>Done</button></div></div>;
}
