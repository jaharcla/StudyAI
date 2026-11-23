import React, { useState } from "react";
import {
  Search,
  User,
  ChevronRight,
  X,
  CheckCircle,
  Circle,
} from "lucide-react";
import {
  lesson,
  boards,
  suggestions,
  progress,
  courses,
} from "./data";

export default function MissionControl() {
  const [focus, setFocus] = useState(false);

  if (focus) {
    return (
      <div className="lab-mission focus-canvas">
        <button className="exit-btn" onClick={() => setFocus(false)} aria-label="Exit canvas">
          <X size={24} />
        </button>
        <div className="canvas-placeholder">Canvas view (focused)</div>
        <style>{`
          .lab-mission.focus-canvas {
            position: fixed;
            inset: 0;
            background: #fff;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            padding: 16px;
          }
          .lab-mission .exit-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: #333;
          }
          .lab-mission .canvas-placeholder {
            flex: 1;
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 2rem;
            color: #555;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="lab-mission">
      {/* Header */}
      <header className="header">
        <div className="brand">StudyAI Lab</div>
        <div className="search">
          <Search size={20} />
          <input type="text" placeholder="Search…" aria-label="Global search" />
        </div>
        <div className="avatar-streak">
          <User size={20} />
          <span className="streak">Streak: {progress.streak} days</span>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <h2>Continue studying</h2>
        <div className="lesson-card">
          <h3>{lesson.title}</h3>
          <p>{lesson.eyebrow}</p>
          <div className="progress-stat">
            <span className="number">{progress.lessons}/{progress.total}</span>
            <span className="label">lessons completed</span>
          </div>
          <button className="primary-action" onClick={() => setFocus(true)}>
            Open Canvas <ChevronRight size={16} />
          </button>
        </div>
      </section>

      {/* Grid */}
      <section className="grid">
        {/* Your Boards */}
        <div className="panel boards">
          <h4>Your boards</h4>
          <ul>
            {boards.map((b, i) => (
              <li key={i} className="board-item">
                <span className="name">{b.name}</span>
                <span className="meta">
                  {b.objects} objects • {b.updated}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Today's Plan */}
        <div className="panel plan">
          <h4>Today's plan</h4>
          <ul>
            <li><CheckCircle size={14} className="checked" /> Review lesson notes</li>
            <li><Circle size={14} className="unchecked" /> Sketch vector diagram</li>
            <li><Circle size={14} className="unchecked" /> Run quick quiz</li>
          </ul>
        </div>

        {/* Course Progress */}
        <div className="panel progress">
          <h4>Course progress</h4>
          {courses.map((c, i) => (
            <div key={i} className="course-item">
              <span className="title">{c.title}</span>
              <div className="bar-bg">
                <div
                  className="bar-fg"
                  style={{ width: `${(c.lessons / 10) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>

        {/* Tutor Suggestions */}
        <div className="panel suggestions">
          <h4>Tutor suggestions</h4>
          <ul>
            {suggestions.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Activity Feed */}
      <section className="activity">
        <h4>Recent activity</h4>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Item</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><Circle size={10} className="status" /></td>
              <td>Added new vector</td>
              <td>5 min ago</td>
            </tr>
            <tr>
              <td><CheckCircle size={10} className="status" /></td>
              <td>Completed quiz</td>
              <td>1 hr ago</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Scoped CSS */}
      <style>{`
        .lab-mission {
          font-family: system-ui, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          color: #222;
          width: 100vw;
          height: 100vh;
          overflow: auto;
          background: #fafafa;
        }
        .lab-mission .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #001f3f; /* deep navy */
          color: #fff;
          padding: 12px 24px;
        }
        .lab-mission .brand { font-weight: 600; font-size: 1.1rem; }
        .lab-mission .search { display: flex; align-items: center; background: #fff; padding: 4px 8px; border-radius: 4px; }
        .lab-mission .search input { border: none; outline: none; margin-left: 4px; font-size: 12px; }
        .lab-mission .avatar-streak { display: flex; align-items: center; gap: 4px; }
        .lab-mission .hero { padding: 24px; background: #e9f0ff; display: flex; flex-direction: column; align-items: flex-start; }
        .lab-mission .lesson-card { background: #fff; border: 1px solid #ddd; padding: 16px; border-radius: 6px; margin-top: 12px; width: 100%; max-width: 480px; }
        .lab-mission .lesson-card h3 { margin: 0 0 4px; font-size: 1rem; }
        .lab-mission .lesson-card p { margin: 0 0 8px; color: #555; font-size: 0.85rem; }
        .lab-mission .progress-stat { font-size: 1.2rem; font-weight: 600; color: #5b5bd6; margin-bottom: 12px; }
        .lab-mission .primary-action { background: #5b5bd6; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px; }
        .lab-mission .grid { display: grid; grid-template-columns: 2fr 1fr 2fr 1fr; gap: 16px; padding: 24px; }
        .lab-mission .panel { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
        .lab-mission .panel h4 { margin: 0 0 8px; font-size: 0.9rem; color: #333; }
        .lab-mission .boards ul, .lab-mission .plan ul, .lab-mission .suggestions ul { list-style: none; padding: 0; margin: 0; }
        .lab-mission .board-item { display: flex; justify-content: space-between; font-size: 0.85rem; padding: 4px 0; }
        .lab-mission .plan li { display: flex; align-items: center; gap: 4px; font-size: 0.85rem; margin-bottom: 4px; }
        .lab-mission .plan .checked { color: #5b5bd6; }
        .lab-mission .plan .unchecked { color: #bbb; }
        .lab-mission .progress .course-item { margin-bottom: 8px; }
        .lab-mission .progress .title { font-size: 0.8rem; }
        .lab-mission .bar-bg { background: #eee; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 2px; }
        .lab-mission .bar-fg { background: #e0533a; height: 100%; }
        .lab-mission .suggestions li { font-size: 0.85rem; margin-bottom: 4px; }
        .lab-mission .activity { padding: 0 24px 24px; }
        .lab-mission .activity table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .lab-mission .activity th, .lab-mission .activity td { padding: 4px; text-align: left; }
        .lab-mission .activity tr:nth-child(even) { background: #f9f9f9; }
        .lab-mission .status { color: #5b5bd6; }
      `}</style>
    </div>
  );
}

