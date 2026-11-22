import React, { useState } from "react";
import { LayoutDashboard, Layers, Play, BookOpen, Settings } from "lucide-react";
import { course, lesson, courses, boards, tools, suggestions, objects, progress } from "./data";

export default function StudioCommand() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [activeBoard, setActiveBoard] = useState(boards[0].name);

  return (
    <div className="lab-studio">
      {/* Icon rail */}
      <nav className="rail">
        <div className="rail-top">
          <button className="rail-button" aria-label="Home">
            <LayoutDashboard size={20} />
          </button>
        </div>
        <div className="rail-buttons">
          <button className="rail-button" aria-label="Boards">
            <Layers size={20} />
          </button>
          <button className="rail-button" aria-label="Activities">
            <Play size={20} />
          </button>
          <button className="rail-button" aria-label="Library">
            <BookOpen size={20} />
          </button>
          <button className="rail-button" aria-label="Settings">
            <Settings size={20} />
          </button>
        </div>
        <div className="rail-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle Sidebar">
          {sidebarOpen ? "←" : "→"}
        </div>
      </nav>

      {/* Secondary sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <h3 className="sidebar-title">{course.title}</h3>
        <p className="lesson-title">{lesson.title}</p>
        <ul className="course-list">
          {courses.map((c, i) => (
            <li key={i} className="course-item">
              <span>{c.title}</span>
              <span className="badge">{c.lessons} lessons</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main area */}
      <section className="main">
        {/* Top command bar */}
        <header className="top-bar">
          <div className="command-input">
            <input type="text" placeholder="⌘K Search commands..." />
          </div>
          <div className="status-chips">
            <span className="chip">Progress {progress.lessons}/{progress.total}</span>
            <span className="chip">Streak {progress.streak}d</span>
          </div>
        </header>

        {/* Board tabs */}
        <div className="board-tabs">
          {boards.map((b, i) => (
            <button
              key={i}
              className={`tab ${activeBoard === b.name ? "active" : ""}`}
              onClick={() => setActiveBoard(b.name)}
            >
              {b.name}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="canvas">
          {/* Placeholder canvas */}
          <div className="canvas-placeholder">Canvas for {activeBoard}</div>
        </div>

        {/* Floating toolbar */}
        <div className="floating-toolbar">
          {tools.slice(0, 5).map((t, i) => (
            <button key={i} className="tool-button" title={t.label}>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* Inspector */}
      <aside className="inspector">
        <h4>Inspector</h4>
        {objects.slice(0, 1).map((obj, i) => (
          <div key={i} className="object-card">
            <strong>{obj.label}</strong>
            <p>{obj.detail}</p>
            <div className="fields">
              <label>X <input type="number" defaultValue={obj.x} /></label>
              <label>Y <input type="number" defaultValue={obj.y} /></label>
            </div>
          </div>
        ))}
      </aside>

      {/* AI Tutor drawer */}
      <div className={`tutor-drawer ${tutorOpen ? "open" : ""}`}>
        <div className="tutor-toggle" onClick={() => setTutorOpen(!tutorOpen)}>
          {tutorOpen ? "▼" : "▲"} AI Tutor
        </div>
        {tutorOpen && (
          <div className="tutor-content">
            <p>How can I help you with {lesson.title}?</p>
            <ul>
              {suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Scoped styles */}
      <style>{`\
        .lab-studio {\
          display: flex;\
          width: 100vw;\
          height: 100vh;\
          overflow: hidden;\
          font-family: sans-serif;\
          font-size: 11px;\
          color: #e0e0e0;\
          background: #1a1a1a;\
        }\
        .rail {\
          width: 56px;\
          background: #2b2b2b;\
          display: flex;\
          flex-direction: column;\
          align-items: center;\
          padding: 8px 0;\
          position: relative;\
        }\
        .rail-button {\
          background: none;\
          border: none;\
          color: #888;\
          margin: 8px 0;\
          cursor: pointer;\
        }\
        .rail-button:hover, .rail-button:focus { color: #0ff; }\
        .rail-toggle {\
          position: absolute;\
          bottom: 8px;\
          cursor: pointer;\
          font-size: 12px;\
          color: #555;\
        }\
        .sidebar {\
          width: 240px;\
          background: #252525;\
          padding: 12px;\
          overflow-y: auto;\
          transition: transform 0.2s ease;\
        }\
        .sidebar.closed { transform: translateX(-100%); }\
        .sidebar-title { margin: 0 0 4px; font-weight: bold; color: #fff; }\
        .lesson-title { margin: 0 0 12px; color: #ccc; }\
        .course-list { list-style: none; padding: 0; margin: 0; }\
        .course-item { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid #333; }\
        .badge { color: #0ff; }\
        .main { flex: 1; display: flex; flex-direction: column; position: relative; }\
        .top-bar { height: 40px; background: #2b2b2b; display: flex; align-items: center; padding: 0 12px; border-bottom: 1px solid #333; }\
        .command-input input { width: 250px; padding: 4px 8px; background: #1a1a1a; border: 1px solid #444; color: #e0e0e0; }\
        .status-chips .chip { background: #0ff; color: #000; padding: 2px 6px; margin-left: 8px; border-radius: 2px; }\
        .board-tabs { display: flex; background: #222; border-bottom: 1px solid #333; }\
        .tab { background: none; border: none; padding: 8px 12px; color: #aaa; cursor: pointer; }\
        .tab.active { background: #0ff; color: #000; }\
        .canvas { flex: 1; background: #111; display: flex; align-items: center; justify-content: center; color: #555; }\
        .canvas-placeholder { font-size: 14px; color: #777; }\
        .floating-toolbar { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; }\
        .tool-button { background: #0ff; border: none; padding: 4px 8px; font-size: 11px; cursor: pointer; }\
        .inspector { width: 300px; background: #252525; padding: 12px; overflow-y: auto; }\
        .object-card { border: 1px solid #333; padding: 8px; margin-bottom: 8px; }\
        .fields label { display: block; margin-top: 4px; }\
        .fields input { width: 60px; margin-left: 4px; background: #1a1a1a; border: 1px solid #444; color: #e0e0e0; }\
        .tutor-drawer { position: absolute; left: 0; right: 0; bottom: 0; background: #1e1e1e; border-top: 1px solid #333; height: 36px; transition: height 0.2s ease; overflow: hidden; }\
        .tutor-drawer.open { height: 180px; }\
        .tutor-toggle { cursor: pointer; padding: 4px 8px; text-align: center; background: #0ff; color: #000; }\
        .tutor-content { padding: 8px; color: #e0e0e0; }\
        ::selection { background: #0ff; color: #000; }\
      `}</style>
    </div>
  );
}
