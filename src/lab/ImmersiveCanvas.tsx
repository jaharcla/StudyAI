import { useState } from "react";
import {
  Atom, Beaker, ChevronRight, Compass, Hand, Menu, MessageSquare, MousePointer2,
  PenLine, Search, Shapes, Sparkles, Type, X,
} from "lucide-react";
import { boards, course, lesson, objects, suggestions, tools } from "./data";

type StudyMode = "session" | "quiz" | "flashcards";

export default function ImmersiveCanvas({ onOpenStudy }: { onOpenStudy: (mode: StudyMode) => void }) {
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tool, setTool] = useState("Select and move");

  const dock = [
    { label: "Select and move", icon: MousePointer2 },
    { label: "Pan canvas", icon: Hand },
    { label: "Freehand pen", icon: PenLine },
    { label: "Shapes", icon: Shapes },
    { label: "Text", icon: Type },
    { label: "Vector", icon: Atom },
  ];

  return (
    <div className="lab-immersive">
      <div className="ic-surface">
        <div className="ic-grid" />
        {objects.map((object, index) => (
          <div key={object.label} className={`ic-object ic-${object.type}`} style={{ left: `${object.x}%`, top: `${object.y}%` }}>
            <div className="ic-object-head"><span>{object.type}</span><span>0{index + 1}</span></div>
            <strong>{object.label}</strong>
            <p>{object.detail}</p>
          </div>
        ))}
        <svg className="ic-vector" viewBox="0 0 400 260" aria-hidden="true">
          <defs><marker id="ic-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="currentColor" /></marker></defs>
          <line x1="60" y1="200" x2="300" y2="78" stroke="currentColor" strokeWidth="2" markerEnd="url(#ic-arrow)" />
          <line x1="60" y1="200" x2="300" y2="230" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 5" opacity=".5" />
          <circle cx="60" cy="200" r="4" fill="currentColor" />
        </svg>
      </div>

      <header className="ic-topbar">
        <button className="ic-icon" onClick={() => setCoursesOpen(true)} title="Open courses"><Menu size={18} /></button>
        <div className="ic-crumb">
          <span>{course.title}</span><ChevronRight size={13} /><strong>{lesson.title}</strong>
        </div>
        <div className="ic-topright">
          <span className="ic-chip"><i /> Local storage connected</span>
          <button className="ic-icon" title="Search"><Search size={17} /></button>
          <button className="ic-tutor-toggle" onClick={() => setTutorOpen(!tutorOpen)}>
            <Sparkles size={15} /> Ask the tutor
          </button>
        </div>
      </header>

      <div className="ic-board-chip"><span className="ic-dot" /> {boards[0].name} <small>saved</small></div>

      <nav className="ic-dock" aria-label="Canvas tools">
        {dock.map((item) => (
          <button key={item.label} className={tool === item.label ? "active" : ""} onClick={() => setTool(item.label)} title={item.label}>
            <item.icon size={18} />
          </button>
        ))}
        <span className="ic-divider" />
        <button title="Science tools"><Beaker size={18} /></button>
      </nav>

      <div className="ic-hint">{tool} · click the canvas to place</div>

      {tutorOpen && (
        <aside className="ic-tutor">
          <div className="ic-tutor-head"><span><Sparkles size={14} /> Study tutor</span><button onClick={() => setTutorOpen(false)}><X size={15} /></button></div>
          <div className="ic-tutor-body">
            <p className="ic-ask">{lesson.title}</p>
            <p className="ic-tutor-copy">Ask about this board, request a worked example, or check a course excerpt.</p>
            <div className="ic-suggestions">
              {suggestions.map((suggestion) => <button key={suggestion}>{suggestion}<ChevronRight size={13} /></button>)}
            </div>
            <div className="ic-study-tools">
              <span>STUDY TOOLS</span>
              <div>
                <button onClick={() => onOpenStudy("session")}><MessageSquare size={14} /> Ask</button>
                <button onClick={() => onOpenStudy("quiz")}><Sparkles size={14} /> Quiz</button>
                <button onClick={() => onOpenStudy("flashcards")}><Shapes size={14} /> Cards</button>
              </div>
            </div>
          </div>
          <div className="ic-input"><span>Type a message…</span><button><ChevronRight size={15} /></button></div>
        </aside>
      )}

      {coursesOpen && (
        <>
          <div className="ic-scrim" onClick={() => setCoursesOpen(false)} />
          <aside className="ic-courses">
            <div className="ic-courses-head"><strong>Courses</strong><button onClick={() => setCoursesOpen(false)}><X size={16} /></button></div>
            <div className="ic-course-list">
              {[course, ...tools.slice(0, 0)].map(() => null)}
              {[course, { title: "DEMO Chemistry", code: "DEMO-CHEM", color: "#5f8a6b" }, { title: "DEMO Mathematics", code: "DEMO-MATH", color: "#c9a227" }].map((item) => (
                <button key={item.code}><i style={{ background: item.color }} /><span>{item.title}<small>{item.code}</small></span></button>
              ))}
            </div>
            <div className="ic-courses-foot"><Compass size={15} /> Local workspace</div>
          </aside>
        </>
      )}

      <style>{`
        .lab-immersive{position:relative;width:100vw;height:100vh;overflow:hidden;background:#f4f2ec;color:#2a2621;font-family:'DM Sans',system-ui,sans-serif}
        .ic-surface{position:absolute;inset:0;overflow:hidden}
        .ic-grid{position:absolute;inset:0;background-image:radial-gradient(#d8d2c5 1px,transparent 1px);background-size:26px 26px;opacity:.75}
        .ic-vector{position:absolute;left:22%;top:34%;width:38%;height:44%;color:#a66843;overflow:visible}
        .ic-object{position:absolute;width:186px;padding:11px 12px;border:1px solid #ded7c9;border-radius:9px;background:rgba(255,253,248,.96);box-shadow:0 8px 26px rgba(60,44,25,.10)}
        .ic-object-head{display:flex;justify-content:space-between;color:#9a8f80;font-size:8px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}
        .ic-object strong{display:block;margin-top:6px;font:600 12px Georgia,serif}
        .ic-object p{margin:4px 0 0;color:#6f665a;font-size:11px}
        .ic-note{border-color:#d8c9b5;background:#fffaf1}
        .ic-topbar{position:absolute;z-index:20;top:0;left:0;right:0;height:56px;display:flex;align-items:center;gap:12px;padding:0 16px;background:linear-gradient(#f4f2ecf2,#f4f2ec00)}
        .ic-icon{display:grid;place-items:center;width:34px;height:34px;border:1px solid #ddd6c8;border-radius:8px;background:rgba(255,253,248,.9);color:#5d5448;cursor:pointer}
        .ic-crumb{display:flex;align-items:center;gap:7px;font-size:12px;color:#8a8072}
        .ic-crumb strong{color:#2a2621;font-weight:600}
        .ic-topright{margin-left:auto;display:flex;align-items:center;gap:8px}
        .ic-chip{display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #ddd6c8;border-radius:99px;background:rgba(255,253,248,.9);font-size:10px;color:#6f665a}
        .ic-chip i{width:6px;height:6px;border-radius:50%;background:#5d8f68}
        .ic-tutor-toggle{display:flex;align-items:center;gap:7px;padding:8px 13px;border:0;border-radius:8px;background:#2a2621;color:#f6f1e8;font-size:11px;font-weight:600;cursor:pointer}
        .ic-board-chip{position:absolute;z-index:10;top:70px;left:18px;display:flex;align-items:center;gap:8px;padding:7px 11px;border:1px solid #ddd6c8;border-radius:8px;background:rgba(255,253,248,.92);font-size:11px}
        .ic-board-chip small{color:#9a8f80;font-size:9px}
        .ic-dot{width:7px;height:7px;border-radius:50%;background:#a66843}
        .ic-dock{position:absolute;z-index:20;bottom:22px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:3px;padding:6px;border:1px solid #ded7c9;border-radius:13px;background:rgba(255,253,248,.97);box-shadow:0 10px 34px rgba(60,44,25,.16)}
        .ic-dock button{display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:#6b6256;cursor:pointer}
        .ic-dock button:hover{background:#f0ebe2}
        .ic-dock button.active{background:#2a2621;color:#fff}
        .ic-divider{width:1px;height:20px;margin:0 3px;background:#ded7c9}
        .ic-hint{position:absolute;z-index:10;bottom:26px;left:18px;font-size:10px;color:#9a8f80}
        .ic-tutor{position:absolute;z-index:30;right:18px;top:70px;bottom:70px;width:330px;display:flex;flex-direction:column;border:1px solid #ded7c9;border-radius:14px;background:#fffdf8;box-shadow:0 20px 60px rgba(50,36,20,.20);overflow:hidden}
        .ic-tutor-head{display:flex;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid #eee8dd;font-size:12px;font-weight:600}
        .ic-tutor-head span{display:flex;align-items:center;gap:7px}
        .ic-tutor-head button,.ic-courses-head button{border:0;background:transparent;color:#8a8072;cursor:pointer}
        .ic-tutor-body{flex:1;padding:18px 16px;overflow:auto}
        .ic-ask{margin:0;font:600 18px/1.35 Georgia,serif}
        .ic-tutor-copy{margin:10px 0 22px;color:#6f665a;font-size:12px;line-height:1.6}
        .ic-suggestions{display:grid;gap:6px}
        .ic-suggestions button{display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid #ece5d9;border-radius:8px;background:#fbf8f2;color:#574e43;text-align:left;font-size:11px;cursor:pointer}
        .ic-study-tools{margin-top:22px;padding-top:16px;border-top:1px solid #eee8dd}
        .ic-study-tools>span{display:block;margin-bottom:9px;color:#9a8f80;font-size:9px;font-weight:700;letter-spacing:.13em}
        .ic-study-tools>div{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
        .ic-study-tools button{display:flex;flex-direction:column;align-items:center;gap:5px;padding:11px 5px;border:1px solid #ded7c9;border-radius:9px;background:#fffdf8;color:#574e43;font-size:10px;font-weight:600;cursor:pointer}
        .ic-study-tools button:hover{border-color:#a66843;background:#faf5ee;color:#9a623f}
        .ic-input{display:flex;align-items:center;justify-content:space-between;margin:12px;padding:11px 13px;border:1px solid #ded7c9;border-radius:10px;color:#a39888;font-size:12px}
        .ic-input button{border:0;background:#2a2621;color:#fff;border-radius:7px;width:28px;height:28px;display:grid;place-items:center;cursor:pointer}
        .ic-scrim{position:absolute;z-index:40;inset:0;background:rgba(42,38,33,.28)}
        .ic-courses{position:absolute;z-index:50;top:0;bottom:0;left:0;width:300px;padding:18px;background:#fffdf8;box-shadow:12px 0 50px rgba(40,30,20,.2)}
        .ic-courses-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;font:600 15px Georgia,serif}
        .ic-course-list{display:grid;gap:4px}
        .ic-course-list button{display:flex;align-items:center;gap:10px;padding:11px;border:0;border-radius:9px;background:transparent;text-align:left;cursor:pointer}
        .ic-course-list button:hover{background:#f6f1e8}
        .ic-course-list i{width:9px;height:9px;border-radius:50%}
        .ic-course-list span{font-size:12px;font-weight:600;color:#3a342c}
        .ic-course-list small{display:block;font-size:9px;color:#9a8f80;font-weight:400}
        .ic-courses-foot{position:absolute;bottom:18px;left:18px;display:flex;align-items:center;gap:7px;font-size:10px;color:#9a8f80}
      `}</style>
    </div>
  );
}
