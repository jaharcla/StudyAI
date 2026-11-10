import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CopilotChat, CopilotKitProvider, useAgentContext } from "@copilotkit/react-core/v2";
import { Activity, Atom, BookOpen, Brain, ChevronLeft, ChevronRight, CircleHelp, FileText, FlaskConical, GraduationCap, Layers, Menu, Moon, MoreHorizontal, PanelRightClose, PanelRightOpen, Plus, Search, Settings2, Sparkles, Sun, X } from "lucide-react";
import { formalCharge, vectorDot, vectorMagnitude, type Element } from "./science";
import { CanvasStudio } from "./canvas/CanvasStudio";
import { parseSourceReference } from "./components/document-intelligence/api";
import { StudyPanel } from "./learning/StudyPanel";
import { ActivityLibrary, type ActivitySession } from "./learning/ActivityLibrary";
import { ActivityTaskPanel } from "./learning/ActivityTaskPanel";
import { lessonPreferenceKey, selectCourse, selectLesson } from "./workspace-state";
const DocumentLibrary = lazy(() => import("./components/document-intelligence").then((module) => ({ default: module.DocumentLibrary })));


import { API } from "./api";

type Course = { id: string; title: string; code: string; color: string };
type View = "Canvas" | "Lecture" | "Split";
type Lesson = { id: string; title: string };
const noCourse: Course = { id: "", title: "", code: "", color: "#888888" };

function Workspace() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState(noCourse);
  const [courseError, setCourseError] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [lessonError, setLessonError] = useState("");
  const lessonTitle = lessons.find((item) => item.id === lessonId)?.title ?? "";
  const [view, setView] = useState<View>("Canvas");
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const [sidebar, setSidebar] = useState(() => window.matchMedia("(min-width: 901px)").matches);
  const [tutor, setTutor] = useState(() => window.matchMedia("(min-width: 1181px)").matches);
  const [dark, setDark] = useState(false);
  const [settings, setSettings] = useState(false);
  const [models, setModels] = useState<Array<{ name: string; size: number }>>([]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("studyai.model") ?? "");
  const [aiStatus, setAiStatus] = useState("Checking AI provider…");
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
  const [tutorContextOpen, setTutorContextOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Connecting to local storage…");
  const [tutorWidth, setTutorWidth] = useState(360);
  const [openDocumentId, setOpenDocumentId] = useState<string>();
  const [openSourceRef, setOpenSourceRef] = useState<string>();
  const [openSourceKey, setOpenSourceKey] = useState(0);
  const dragRef = useRef(false);
  const [canvasSummary, setCanvasSummary] = useState({ objectCount: 0, objectTypes: {} as Record<string, number> });
  const updateCanvasSummary = useCallback((summary: { objectCount: number; objectTypes: Record<string, number> }) => setCanvasSummary(summary), []);
  const updateStatus = useCallback((next: string) => setStatus(next), []);
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

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const update = () => {
      setCompact(query.matches);
      if (query.matches) {
        setSidebar(false);
        setTutor(false);
        setView((current) => current === "Split" ? "Canvas" : current);
      }
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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
      if (!response.ok) throw new Error(data.error || "AI provider is unavailable.");
      return data;
    }).then((data) => {
      if (!live) return;
      const available: Array<{ name: string; size: number }> = Array.isArray(data.models) ? data.models : [];
      const provider = data.provider === "Groq" ? "Groq" : "Ollama";
      setModels(available);
      setAiStatus(provider === "Groq" ? "Groq configured" : available.length ? "Ollama connected" : "Ollama connected · no models installed");
      setSelectedModel((current) => {
        const next = available.some((item) => item.name === current) ? current : available.some((item) => item.name === data.configuredModel) ? data.configuredModel : (available[0]?.name ?? "");
        if (next) localStorage.setItem("studyai.model", next); else localStorage.removeItem("studyai.model");
        return next;
      });
    }).catch((error) => { if (live) { setModels([]); setSelectedModel(""); localStorage.removeItem("studyai.model"); setAiStatus(error instanceof Error ? error.message : "AI provider is unavailable"); } });
    return () => { live = false; };
  }, []);

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

  const changeCourse = (next: Course) => {
    if (next.id === course.id) return;
    closeActivity(); setActivityLibraryOpen(false);
    setCourse(next);
    setLessons([]);
    setLessonId("");
    setStatus("Loading course…");
    localStorage.setItem("studyai.course", next.id);
    if (compact) setSidebar(false);
  };

  const changeLesson = (nextId: string) => {
    closeActivity(); setActivityLibraryOpen(false);
    setLessonId(nextId);
    setStatus("Loading lesson…");
    if (course.id) localStorage.setItem(lessonPreferenceKey(course.id), nextId);
    if (compact) setSidebar(false);
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
      if (compact) setTutor(false);
    } catch { return; }
  };

  const openLinkedNote = useCallback(async (id: string) => {
    try {
      const rows = await fetch(`${API}/notes?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lessonId)}`).then((response) => response.json());
      const linked = rows.find((item: any) => item.id === id);
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

  const selectWorkspaceView = (next: View) => {
    setView(next);
    if (compact) setTutor(false);
  };
  const statusTone = /unavailable|could not|failed|changed elsewhere|invalid/i.test(status) ? "error" : /saving|loading|connecting/i.test(status) ? "busy" : "ready";
  const aiTone = /unavailable|failed|error|no models/i.test(aiStatus) ? "warning" : "ready";


  return <>
    {course.id && lessonId && <AgentContext course={course} canvas={canvasSummary} view={view} model={selectedModel} lessonId={lessonId} lessonTitle={lessonTitle} />}
    <div className={`app-shell focus-workspace ${dark ? "dark" : ""} ${sidebar ? "has-sidebar" : ""} ${tutor ? "has-tutor" : ""}`}>
      {sidebar && compact && <button className="sidebar-backdrop" aria-label="Close course navigation" onClick={() => setSidebar(false)} />}
      {sidebar && <aside className="sidebar" aria-label="Course navigation">
        <div className="brand-row">
          <div className="brand-mark"><Sparkles size={17} /></div>
          <span className="brand-copy"><strong>study<span className="brand-ai">ai</span></strong><small>Learning workspace</small></span>
          <button className="icon-button sidebar-close" onClick={() => setSidebar(false)} title="Collapse sidebar" aria-label="Collapse sidebar"><ChevronLeft size={16} /></button>
        </div>
        <button className="search-button" disabled title="Global search is not available yet"><Search size={15} /><span>Search workspace</span><kbd>⌘ K</kbd></button>
        <div className="nav-label">WORKSPACE</div>
        <button className="nav-item active"><GraduationCap size={17} /> Study workspace</button>
        <button className="nav-item" disabled title="Learning progress is not available yet"><Activity size={17} /> Learning progress</button>
        <div className="course-heading"><span>COURSES</span><button className="icon-button" onClick={() => void addCourse()} title="Add course" aria-label="Add course"><Plus size={16} /></button></div>
        <div className="course-list">{courses.map((item) => <button key={item.id} className={`course-item ${course.id === item.id ? "selected" : ""}`} onClick={() => changeCourse(item)}><i style={{ background: item.color }} /><span><b>{item.title}</b><small>{item.code}</small></span><MoreHorizontal size={15} className="course-more" aria-hidden="true" /></button>)}</div>
        {course.id ? <div className="course-tree"><div className="tree-course">{course.title}</div>{lessons.map((item) => <button key={item.id} className={`tree-sub ${lessonId === item.id ? "lesson-current" : ""}`} onClick={() => changeLesson(item.id)}>{lessonId === item.id && <span className="lesson-dot" />}{item.title}</button>)}<button className="tree-sub add-lesson" onClick={() => void addLesson()}><Plus size={12} /> Add lesson</button>{lessonError && <small role="alert">{lessonError}</small>}</div> : <div className="course-tree"><span>{courseError || (status === "No courses yet" ? "Add a course to begin." : "Loading courses…")}</span><button className="tree-sub add-lesson" onClick={() => void addCourse()}><Plus size={12} /> Add course</button></div>}
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setSettings(true)}><Settings2 size={17} /> Settings</button>
          <div className={`local-status ${statusTone}`}><span /> <div><b>Workspace sync</b><small>{status}</small></div></div>
        </div>
      </aside>}

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><button className="icon-button" onClick={() => setSidebar(!sidebar)} title="Toggle courses" aria-label="Toggle courses"><Menu size={18} /></button><span>Workspace</span>{course.title && <><ChevronRight size={14} /><span>{course.title}</span></>}{lessonTitle && <><ChevronRight size={14} /><b>{lessonTitle}</b></>}</div>
          <div className="top-actions"><span className={`saved ${statusTone}`}><span />{status}</span><button className="icon-button" onClick={() => setDark(!dark)} title="Toggle theme" aria-label="Toggle theme">{dark ? <Sun size={17} /> : <Moon size={17} />}</button><button className="icon-button" disabled title="Help is not available yet" aria-label="Help is not available yet"><CircleHelp size={17} /></button><button className="icon-button" onClick={() => setSettings(true)} title="Settings" aria-label="Settings"><Settings2 size={17} /></button></div>
        </header>

        <section className="lesson-header">
          <div className="lesson-title-block">
            <div className="eyebrow"><span className="eyebrow-icon"><Atom size={14} /></span>{course.code || course.title || "COURSE WORKSPACE"}</div>
            <div className="lesson-title-row">
              <h1>{lessonTitle || (course.id ? "Choose a lesson" : "Create a course")}</h1>
              <select className="lesson-selector" aria-label="Active lesson" value={lessonId} disabled={!lessons.length} onChange={(event) => changeLesson(event.target.value)}>{lessons.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
            </div>
            <p>{lessonTitle ? `Build, review, and explain ideas from ${lessonTitle}.` : lessonError || "Select or create a lesson to start studying."}</p>
          </div>
          <div className="lesson-actions">
            <div className="workspace-facts" aria-label="Workspace summary"><span><b>{canvasSummary.objectCount}</b> canvas objects</span><span><b>{view}</b> view</span></div>
            <button className="button-soft study-lesson-button" disabled={!course.id || !lessonId} onClick={() => setStudyOpen(true)}><Brain size={15} /> Study this lesson</button>
          </div>
        </section>

        <section className="workspace-toolbar">
          <div className="view-switch" role="group" aria-label="Workspace view">
            {(["Canvas", "Lecture", ...(!compact ? ["Split" as const] : [])] as View[]).map((item) => <button aria-label={item} aria-pressed={view === item} key={item} className={view === item ? "current" : ""} onClick={() => selectWorkspaceView(item)}>{item === "Canvas" ? <Layers size={15} /> : item === "Lecture" ? <BookOpen size={15} /> : <PanelRightOpen size={15} />}{item === "Lecture" ? "Sources" : item}</button>)}
          </div>
          <div className="toolbar-actions">
            <button className="tool-chip" disabled={!course.id || !lessonId} onClick={() => setActivityLibraryOpen(true)}><Activity size={15} /> Activities</button>
            <button className="tool-chip" disabled={!course.id || !lessonId} onClick={() => setNoteOpen(true)}><FileText size={15} /> Notes</button>
            <button className="tool-chip" onClick={() => setScienceTool("chem")}><Atom size={15} /> Science tools</button>
            {!tutor && <button className="tool-chip tutor-toggle" disabled={!course.id || !lessonId} onClick={() => setTutor(true)}><Sparkles size={15} /> Tutor</button>}
          </div>
        </section>

        <div className={`work-area ${view.toLowerCase()}`}>
          <div className="canvas-pane" hidden={view === "Lecture"}>
            <div className="pane-label"><span><Layers size={13} /> ACTIVE CANVAS</span><span className="canvas-tip">Draw, model, calculate, and connect ideas</span></div>
            {course.id && lessonId ? <div className="canvas-workspace"><CanvasStudio key={`${course.id}:${lessonId}`} courseId={course.id} lessonId={lessonId} theme={dark ? "dark" : "light"} onStatus={updateStatus} onOpenNote={openLinkedNote} onOpenDocument={openLinkedDocument} onSummary={updateCanvasSummary} preferredBoardId={preferredBoardId} onBoardState={updateActivityCanvas} activityMode={Boolean(activeActivity)} compactTools={view === "Split"} />{activeActivity && <ActivityTaskPanel courseId={course.id} lessonId={lessonId} session={activeActivity} canvas={activityCanvasState} onClose={closeActivity} />}</div> : <div className="canvas-loading">{courseError || lessonError || (course.id ? "Add a lesson to create a canvas." : "Select or create a course to create a canvas.")}</div>}
          </div>
          {(view === "Lecture" || view === "Split") && <div className="lecture-pane">
            <div className="pane-label"><span><BookOpen size={13} /> COURSE SOURCES</span><span className="canvas-tip">Import, search, and cite lesson material</span></div>
            {course.id && <Suspense fallback={<div className="pane-loading">Loading course sources…</div>}><DocumentLibrary key={`${course.id}:${lessonId}`} courseId={course.id} lessonId={lessonId} initialDocumentId={openDocumentId} courses={courses} onCourseChange={(id) => { const selected = courses.find((item) => item.id === id); if (selected) changeCourse(selected); }} initialSourceRef={openSourceRef} initialSourceKey={openSourceKey} initialQuery={query} /></Suspense>}
          </div>}
        </div>
      </main>

      {tutor && course.id && lessonId && <>
        <div className="resize-handle" role="separator" aria-label="Resize tutor panel" aria-orientation="vertical" tabIndex={0} onKeyDown={(event) => { if (event.key === "ArrowLeft") setTutorWidth((width) => Math.min(520, width + 20)); if (event.key === "ArrowRight") setTutorWidth((width) => Math.max(300, width - 20)); }} onMouseDown={() => { dragRef.current = true; }} onMouseMove={changeWidth} onMouseUp={() => { dragRef.current = false; }} onMouseLeave={() => { dragRef.current = false; }} />
        <aside className="tutor-panel" style={{ width: tutorWidth }} aria-label="Study tutor">
          <div className="tutor-header"><div className="tutor-title"><div className="tutor-avatar"><Sparkles size={15} /></div><span><b>Study tutor</b><small className={`tutor-status ${aiTone}`}><i />{aiStatus}</small></span></div><div className="tutor-header-actions"><button className="icon-button" title="Tutor options are not available yet" aria-label="Tutor options are not available yet" disabled><MoreHorizontal size={17} /></button><button className="icon-button" onClick={() => setTutor(false)} title="Close tutor" aria-label="Close tutor"><PanelRightClose size={17} /></button></div></div>
          {tutorContextOpen ? <div className="tutor-context"><div className="context-label"><span>ACTIVE CONTEXT</span><button className="icon-button" onClick={() => setTutorContextOpen(false)} aria-label="Hide lesson context"><X size={13} /></button></div><div className="context-card"><div className="context-icon"><Atom size={15} /></div><span><b>{lessonTitle}</b><small>{course.title} · {canvasSummary.objectCount} canvas objects</small></span></div><p>Responses can use lesson sources and the active canvas. Citations open directly in Sources.</p></div> : <button className="show-context" onClick={() => setTutorContextOpen(true)}><Atom size={13} /> Show active context</button>}
          <div className="copilot-slot" onClick={openCitation}><CopilotChat className="study-chat" messageView={{ toolCallDisplay: "turn" }} inspectorTools={import.meta.env.DEV} labels={{ welcomeMessageText: `Ask about ${lessonTitle}, request a worked example, or ask about the active canvas.` }} /></div>
          <div className="tutor-disclaimer"><Sparkles size={12} /> Verify important details against cited course sources.</div>
        </aside>
      </>}

      {!tutor && !compact && <button className="reopen-tutor" onClick={() => setTutor(true)}><Sparkles size={16} /> Open tutor</button>}
      <nav className="mobile-workspace-nav" aria-label="Mobile workspace navigation">
        <button className={sidebar ? "current" : ""} onClick={() => setSidebar(true)}><Menu size={18} /><span>Courses</span></button>
        <button className={!tutor && view === "Canvas" ? "current" : ""} onClick={() => selectWorkspaceView("Canvas")}><Layers size={18} /><span>Canvas</span></button>
        <button className={!tutor && view === "Lecture" ? "current" : ""} onClick={() => selectWorkspaceView("Lecture")}><BookOpen size={18} /><span>Sources</span></button>
        <button className={tutor ? "current" : ""} disabled={!course.id || !lessonId} onClick={() => setTutor(true)}><Sparkles size={18} /><span>Tutor</span></button>
      </nav>

      {settings && <div className="modal-shade" onClick={() => setSettings(false)}><div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">PREFERENCES</span><h2 id="settings-title">StudyAI settings</h2></div><button className="icon-button" aria-label="Close settings" onClick={() => setSettings(false)}><X size={18} /></button></div><label>AI provider<input value={aiStatus} readOnly /></label><label>Model<select aria-label="Model" data-testid="model-select" value={selectedModel} disabled={!models.length} onChange={(e) => { setSelectedModel(e.target.value); localStorage.setItem("studyai.model", e.target.value); }}>{!models.length && <option value="">{aiStatus}</option>}{models.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><p>{models.length ? "Your selection is used for the next tutor message." : aiStatus}</p><button className="button-primary" onClick={() => setSettings(false)}>Done</button></div></div>}
      {noteOpen && course.id && lessonId && <div className="modal-shade" onClick={() => setNoteOpen(false)}><div className="settings-modal notes-modal" role="dialog" aria-modal="true" aria-label="Lesson notes" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{course.title} · {lessonTitle}</span><input aria-label="Note title" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} /></div><button className="icon-button" aria-label="Close notes" onClick={() => setNoteOpen(false)}><X size={18} /></button></div><textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write notes for this lesson…" /><p>Notes save automatically to the local SQLite database.</p><button className="button-primary" onClick={() => setNoteOpen(false)}>Done</button></div></div>}
      {scienceTool && <ScienceModal initial={scienceTool} close={() => setScienceTool(null)} />}
      {activityLibraryOpen && course.id && lessonId && <ActivityLibrary courseId={course.id} lessonId={lessonId} onClose={() => setActivityLibraryOpen(false)} onStart={launchActivity} />}
      {studyOpen && course.id && lessonId && <StudyPanel courseId={course.id} lessonId={lessonId} close={() => setStudyOpen(false)} />}
    </div>
  </>;
}

export default function App() { return <CopilotKitProvider runtimeUrl="/api/copilotkit" agentId="studyai"><Workspace /></CopilotKitProvider>; }

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
  return <div className="modal-shade" onClick={close}><div className="settings-modal science-modal" role="dialog" aria-modal="true" aria-labelledby="science-tool-title" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">SCIENTIFIC TOOLS</span><h2 id="science-tool-title">{tool === "chem" ? "Formal charge" : "Vector calculator"}</h2></div><button className="icon-button" aria-label="Close scientific tools" onClick={close}><X size={18} /></button></div><div className="science-tabs"><button className={tool === "chem" ? "current" : ""} onClick={() => setTool("chem")}>CHEM 120</button><button className={tool === "kin" ? "current" : ""} onClick={() => setTool("kin")}>KIN 120</button></div>{tool === "chem" ? <><p className="science-help">Formal charge = valence electrons − nonbonding electrons − bond order sum.</p><label>Element<select value={element} onChange={(e) => setElement(e.target.value as Element)}>{["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"].map((item) => <option key={item}>{item}</option>)}</select></label><div className="science-grid"><label>Nonbonding electrons<input type="number" min="0" value={lone} onChange={(e) => setLone(Number(e.target.value))} /></label><label>Bond order sum<input type="number" min="0" step="0.5" value={bonds} onChange={(e) => setBonds(Number(e.target.value))} /></label></div><div className="science-result">Formal charge <b>{charge > 0 ? `+${charge}` : charge}</b></div></> : <><p className="science-help">Enter a vector to calculate magnitude. Values are treated as x, y, and z components.</p><div className="science-grid">{vector.map((value, i) => <label key={i}>{["x", "y", "z"][i]} component<input type="number" value={value} onChange={(e) => setVector(vector.map((v, j) => i === j ? Number(e.target.value) : v) as [number, number, number])} /></label>)}</div><div className="science-result">Magnitude <b>{vectorMagnitude(...vector).toFixed(3)}</b></div><div className="science-result">Dot with unit x <b>{vectorDot(vector, [1, 0, 0])}</b></div></>}<button className="button-primary science-done" onClick={close}>Done</button></div></div>;
}
