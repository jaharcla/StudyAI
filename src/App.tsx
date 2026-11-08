import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopilotChat, CopilotKitProvider, useAgentContext } from "@copilotkit/react-core/v2";
import { Activity, Atom, BookOpen, Brain, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, FileText, FlaskConical, FolderOpen, GraduationCap, Layers, Menu, Moon, MoreHorizontal, PanelRightClose, PanelRightOpen, Plus, Search, Settings2, Sparkles, Sun, Upload, X } from "lucide-react";
import { formalCharge, vectorDot, vectorMagnitude, type Element } from "./science";
import { CanvasStudio } from "./canvas/CanvasStudio";

type Course = { id: string; title: string; code: string; color: string };
type View = "Canvas" | "Lecture" | "Split";
const API = "http://127.0.0.1:8201/api";
const starterCourses: Course[] = [
  { id: "chem-120", title: "CHEM 120", code: "General chemistry", color: "#ef805c" },
  { id: "biol-130", title: "BIOL 130", code: "Cell biology", color: "#7a9b7b" },
  { id: "kin-120", title: "KIN 120", code: "Biomechanics", color: "#7d91c8" },
];

function Workspace() {
  const [courses, setCourses] = useState(starterCourses);
  const [course, setCourse] = useState(starterCourses[0]);
  const [view, setView] = useState<View>("Canvas");
  const [sidebar, setSidebar] = useState(true);
  const [tutor, setTutor] = useState(true);
  const [dark, setDark] = useState(false);
  const [settings, setSettings] = useState(false);
  const [models, setModels] = useState<Array<{ name: string; size: number }>>([]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("studyai.model") ?? "");
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteTitle, setNoteTitle] = useState("Atomic structure notes");
  const [noteId, setNoteId] = useState<string>();
  const [scienceTool, setScienceTool] = useState<"chem" | "kin" | null>(null);
  const [moduleOpen, setModuleOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<any[]>([]);
  const [status, setStatus] = useState("All changes saved");
  const [tutorWidth, setTutorWidth] = useState(360);
  const uploadRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef(false);
  const [canvasSummary, setCanvasSummary] = useState({ objectCount: 0, objectTypes: {} as Record<string, number> });
  const updateCanvasSummary = useCallback((summary: { objectCount: number; objectTypes: Record<string, number> }) => setCanvasSummary(summary), []);
  const updateStatus = useCallback((next: string) => setStatus(next), []);

  useEffect(() => {
    fetch(`${API}/courses`).then((r) => r.json()).then((rows: Course[]) => { if (rows.length) { setCourses(rows); setCourse(rows[0]); } }).catch(() => undefined);
    fetch(`${API}/models`).then((r) => r.json()).then((data) => {
      const available: Array<{ name: string; size: number }> = Array.isArray(data.models) ? data.models : [];
      setModels(available);
      setSelectedModel((current) => {
        const next = available.some((item) => item.name === current) ? current : available.some((item) => item.name === data.configuredModel) ? data.configuredModel : (available[0]?.name ?? "");
        if (next) localStorage.setItem("studyai.model", next);
        return next;
      });
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    setNote(""); setNoteId(undefined); setNoteTitle("Atomic structure notes");
    fetch(`${API}/notes?course=${course.id}`).then((r) => r.json()).then((rows) => { if (rows[0]) { setNote(rows[0].body); setNoteId(rows[0].id); setNoteTitle(rows[0].title); } }).catch(() => undefined);
  }, [course.id]);

  useEffect(() => {
    if (!noteOpen) return;
    const timer = window.setTimeout(() => {
      fetch(`${API}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: noteId, courseId: course.id, title: noteTitle, body: note }) })
        .then((r) => r.json()).then((saved) => { setNoteId(saved.id); setStatus("Notes saved locally"); }).catch(() => setStatus("Notes save unavailable"));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [note, noteOpen, noteId, noteTitle, course.id]);

  const search = async () => {
    const response = await fetch(`${API}/search?q=${encodeURIComponent(query)}&course=${course.id}`);
    setSources(await response.json());
  };

  const importText = async (file?: File) => {
    if (!file) return;
    const content = await file.text();
    const response = await fetch(`${API}/documents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, content, courseId: course.id }) });
    const result = await response.json();
    setStatus(result.status === "indexed" ? `${file.name} added to course sources` : (result.error ?? "Import failed"));
  };

  const openLinkedNote = useCallback(async (id: string) => {
    try {
      const rows = await fetch(`${API}/notes?course=${course.id}`).then((response) => response.json());
      const linked = rows.find((item: any) => item.id === id);
      if (!linked) { setStatus("Linked note was not found"); return; }
      setNoteId(linked.id); setNoteTitle(linked.title); setNote(linked.body); setNoteOpen(true);
    } catch { setStatus("Linked note is unavailable"); }
  }, [course.id]);

  const openLinkedDocument = useCallback(async (id: string, title: string) => {
    setView("Lecture"); setQuery(title);
    try { const response = await fetch(`${API}/search?q=${encodeURIComponent(title)}&course=${course.id}`); setSources(await response.json()); }
    catch { setSources([{ title, excerpt: `Document ${id} is linked to this canvas.` }]); }
  }, [course.id]);

  const changeWidth = (event: React.MouseEvent) => {
    if (!dragRef.current) return;
    setTutorWidth(Math.min(520, Math.max(300, window.innerWidth - event.clientX)));
  };

  const lecture = <div className="lecture-empty"><div className="pdf-icon"><FileText size={24} /></div><h3>Bring your lecture into the workspace</h3><p>Import a UTF-8 text file to search it alongside your notes.</p><button className="button-primary" onClick={() => uploadRef.current?.click()}><Upload size={15} /> Import text source</button><span>PDF extraction and page citations are not available yet.</span></div>;

  return <div className={`app-shell ${dark ? "dark" : ""}`}>
    {sidebar && <aside className="sidebar">
      <div className="brand-row"><div className="brand-mark"><Sparkles size={17} /></div><span>study<span className="brand-ai">ai</span></span><button className="icon-button sidebar-close" onClick={() => setSidebar(false)} title="Collapse sidebar"><ChevronLeft size={16} /></button></div>
      <button className="search-button"><Search size={15} /><span>Search anything</span><kbd>⌘ K</kbd></button>
      <div className="nav-label">YOUR SPACE</div>
      <button className="nav-item active"><GraduationCap size={17} /> Study workspace</button>
      <button className="nav-item"><Activity size={17} /> Learning progress</button>
      <div className="course-heading"><span>COURSES</span><button className="icon-button" title="Add course"><Plus size={16} /></button></div>
      <div className="course-list">{courses.map((item) => <button key={item.id} className={`course-item ${course.id === item.id ? "selected" : ""}`} onClick={() => setCourse(item)}><i style={{ background: item.color }} /><span><b>{item.title}</b><small>{item.code}</small></span><MoreHorizontal size={15} className="course-more" /></button>)}</div>
      <div className="course-tree"><button className="tree-course" onClick={() => setModuleOpen(!moduleOpen)}><ChevronDown size={14} className={moduleOpen ? "" : "rotated"} />{course.title}</button>{moduleOpen && <><button className="tree-sub">Module 1 · Foundations</button><button className="tree-sub lesson-current"><span className="lesson-dot" />Atomic structure &amp; bonding</button><button className="tree-sub">Module 2 · Reactions</button><button className="tree-sub">Module 3 · Solutions</button></>}</div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setSettings(true)}><Settings2 size={17} /> Settings</button><div className="local-status"><span /> Private and stored on this device</div></div>
    </aside>}

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumbs"><button className="icon-button" onClick={() => setSidebar(!sidebar)} title="Toggle courses"><Menu size={17} /></button><span>{course.title}</span><ChevronRight size={14} /><span>Module 1</span><ChevronRight size={14} /><b>Atomic structure</b></div>
        <div className="top-actions"><span className="saved"><span />{status}</span><button className="icon-button" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun size={17} /> : <Moon size={17} />}</button><button className="icon-button" title="Help"><CircleHelp size={17} /></button><button className="icon-button" onClick={() => setSettings(true)} title="Settings"><Settings2 size={17} /></button></div>
      </header>
      <section className="lesson-header"><div><div className="eyebrow"><span className="eyebrow-icon"><Atom size={14} /></span> MODULE 1 <span className="crumb-dot">·</span> LESSON 03</div><h1>Atomic structure &amp; bonding</h1><p>Build a mental model of atoms, electron configuration, and the forces that hold molecules together.</p></div><button className="button-soft"><Brain size={15} /> Study this lesson</button></section>
      <section className="workspace-toolbar"><div className="view-switch">{(["Canvas", "Lecture", "Split"] as View[]).map((item) => <button key={item} className={view === item ? "current" : ""} onClick={() => setView(item)}>{item === "Canvas" ? <Layers size={14} /> : item === "Lecture" ? <BookOpen size={14} /> : <PanelRightOpen size={14} />}{item}</button>)}</div><div className="toolbar-actions"><button className="tool-chip active" onClick={() => setNoteOpen(true)}><FileText size={14} /> Notes</button><button className="tool-chip" onClick={() => setScienceTool("chem")}><Atom size={14} /> Chemistry</button><button className="icon-button" onClick={() => uploadRef.current?.click()} title="Import source"><FolderOpen size={16} /></button></div></section>
      <div className={`work-area ${view.toLowerCase()}`}>
        {(view === "Canvas" || view === "Split") && <div className="canvas-pane"><div className="pane-label"><span>STUDY CANVAS</span><span className="canvas-tip">Draw, diagram, connect ideas</span></div><CanvasStudio courseId={course.id} lessonId="lesson-03" theme={dark ? "dark" : "light"} onStatus={updateStatus} onOpenNote={openLinkedNote} onOpenDocument={openLinkedDocument} onSummary={updateCanvasSummary} /></div>}
        {(view === "Lecture" || view === "Split") && <div className="lecture-pane"><div className="pane-label"><span>LECTURE &amp; SOURCES</span><button onClick={() => uploadRef.current?.click()}><Plus size={14} /> Add source</button></div>{lecture}<div className="source-search"><div className="source-search-title">Search this course</div><div className="search-line"><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} placeholder="Search your course materials…" /><button onClick={() => void search()}><Search size={15} /></button></div>{sources.map((item, i) => <div key={i} className="source-hit"><FileText size={14} /><span><b>{item.title}</b><small>{item.excerpt}</small></span></div>)}</div></div>}
      </div>
    </main>
    {tutor && <><div className="resize-handle" onMouseDown={() => { dragRef.current = true; }} onMouseMove={changeWidth} onMouseUp={() => { dragRef.current = false; }} onMouseLeave={() => { dragRef.current = false; }} /><aside className="tutor-panel" style={{ width: tutorWidth }}><div className="tutor-header"><div className="tutor-title"><div className="tutor-avatar"><Sparkles size={15} /></div><span><b>Study tutor</b><small><i /> Local AI · {course.title}</small></span></div><div><button className="icon-button" title="Tutor options"><MoreHorizontal size={17} /></button><button className="icon-button" onClick={() => setTutor(false)} title="Close tutor"><PanelRightClose size={17} /></button></div></div><div className="tutor-context"><div className="context-label"><span>LESSON CONTEXT</span><button className="icon-button"><X size={13} /></button></div><div className="context-card"><div className="context-icon"><Atom size={15} /></div><span><b>Atomic structure &amp; bonding</b><small>Module 1 · {course.title}</small></span><ChevronDown size={14} /></div><p>Responses can reference your selected course. Canvas marks stay uninterpreted until you describe them.</p></div><div className="suggestions"><span>TRY ASKING</span><button onClick={() => setQuery("Explain electron configuration")}>Explain electron configuration <ChevronRight size={13} /></button><button onClick={() => setQuery("Quiz me on bonding")}>Quiz me on bonding <ChevronRight size={13} /></button></div><div className="copilot-slot"><CopilotKitProvider runtimeUrl="http://127.0.0.1:8200/api/copilotkit" agentId="studyai"><AgentContext course={course} canvas={canvasSummary} view={view} model={selectedModel} /><CopilotChat className="study-chat" labels={{ welcomeMessageText: "Ask about this lesson, request a worked example, or describe a canvas mark for help." }} /></CopilotKitProvider></div><div className="tutor-disclaimer"><Sparkles size={12} /> AI can make mistakes. Check important details against your sources.</div></aside></>}
    {!tutor && <button className="reopen-tutor" onClick={() => setTutor(true)}><Sparkles size={16} /> Open tutor</button>}
    <input ref={uploadRef} hidden type="file" accept=".txt" onChange={(e) => void importText(e.target.files?.[0])} />
    {settings && <div className="modal-shade" onClick={() => setSettings(false)}><div className="settings-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">PREFERENCES</span><h2>StudyAI settings</h2></div><button className="icon-button" onClick={() => setSettings(false)}><X size={18} /></button></div><label>AI provider<input value="Ollama · local" readOnly /></label><label>Model<select aria-label="Model" data-testid="model-select" value={selectedModel} onChange={(e) => { setSelectedModel(e.target.value); localStorage.setItem("studyai.model", e.target.value); }}>{models.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><p>{models.length ? "Your selection is used for the next tutor message." : "Start Ollama and install a model to enable local chat."}</p><button className="button-primary" onClick={() => setSettings(false)}>Done</button></div></div>}
    {noteOpen && <div className="modal-shade" onClick={() => setNoteOpen(false)}><div className="settings-modal notes-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{course.title} · LESSON 03</span><input aria-label="Note title" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} /></div><button className="icon-button" onClick={() => setNoteOpen(false)}><X size={18} /></button></div><textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write notes for this course…" /><p>Notes save automatically to the local SQLite database.</p><button className="button-primary" onClick={() => setNoteOpen(false)}>Done</button></div></div>}
    {scienceTool && <ScienceModal initial={scienceTool} close={() => setScienceTool(null)} />}
  </div>;
}

export default function App() { return <Workspace />; }

function AgentContext({ course, canvas, view, model }: { course: Course; canvas: { objectCount: number; objectTypes: Record<string, number> }; view: View; model: string }) {
  useAgentContext({ description: "StudyAI current workspace and structured canvas metadata", value: { course: course.title, courseCode: course.code, lesson: "Atomic structure & bonding", view, canvas } });
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
  return <div className="modal-shade" onClick={close}><div className="settings-modal science-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">SCIENTIFIC TOOLS</span><h2>{tool === "chem" ? "Formal charge" : "Vector calculator"}</h2></div><button className="icon-button" onClick={close}><X size={18} /></button></div><div className="science-tabs"><button className={tool === "chem" ? "current" : ""} onClick={() => setTool("chem")}>CHEM 120</button><button className={tool === "kin" ? "current" : ""} onClick={() => setTool("kin")}>KIN 120</button></div>{tool === "chem" ? <><p className="science-help">Formal charge = valence electrons − nonbonding electrons − bond order sum.</p><label>Element<select value={element} onChange={(e) => setElement(e.target.value as Element)}>{["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"].map((item) => <option key={item}>{item}</option>)}</select></label><div className="science-grid"><label>Nonbonding electrons<input type="number" min="0" value={lone} onChange={(e) => setLone(Number(e.target.value))} /></label><label>Bond order sum<input type="number" min="0" step="0.5" value={bonds} onChange={(e) => setBonds(Number(e.target.value))} /></label></div><div className="science-result">Formal charge <b>{charge > 0 ? `+${charge}` : charge}</b></div></> : <><p className="science-help">Enter a vector to calculate magnitude. Values are treated as x, y, and z components.</p><div className="science-grid">{vector.map((value, i) => <label key={i}>{["x", "y", "z"][i]} component<input type="number" value={value} onChange={(e) => setVector(vector.map((v, j) => i === j ? Number(e.target.value) : v) as [number, number, number])} /></label>)}</div><div className="science-result">Magnitude <b>{vectorMagnitude(...vector).toFixed(3)}</b></div><div className="science-result">Dot with unit x <b>{vectorDot(vector, [1, 0, 0])}</b></div></>}<button className="button-primary science-done" onClick={close}>Done</button></div></div>;
}
