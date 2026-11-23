import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { course, lesson, boards, tools, suggestions, progress } from "./data";

export default function StudyFolio() {
  const [noteOpen, setNoteOpen] = useState(true);

  const toggleNote = () => setNoteOpen(!noteOpen);

  return (
    <div className="lab-folio">
      <style>{`\
        .lab-folio {\
          font-family: Georgia, serif;\
          color: #333;\
          background: #faf8f5;\
          width: 100vw;\
          height: 100vh;\
          overflow-y: auto;\
          padding: 0;\
          margin: 0;\
        }\
        .lab-folio * { box-sizing: border-box; }\
        .top-strip {\
          position: sticky;\
          top: 0;\
          background: #faf8f5;\
          border-bottom: 1px solid #e0e0e0;\
          padding: 0.5rem 1rem;\
          display: flex;\
          align-items: center;\
          justify-content: space-between;\
          z-index: 10;\
        }\
        .content-wrapper {\
          display: grid;\
          grid-template-columns: 1fr 240px;\
          max-width: 1200px;\
          margin: 2rem auto;\
          gap: 2rem;\
        }\
        .reading-column {\
          max-width: 760px;\
          line-height: 1.7;\
          font-size: 1rem;\
        }\
        .reading-column h1 {\
          font-family: "Georgia", serif;\
          font-size: 2.2rem;\
          margin: 0 0 0.5rem;\
        }\
        .reading-column p {\
          text-align: justify;\
          text-indent: 2rem;\
          margin-bottom: 1.2rem;\
        }\
        .reading-column p:first-of-type::first-letter {\
          float: left;\
          font-size: 4rem;\
          line-height: 1;\
          margin-right: 0.2rem;\
          color: #b3643a;\
        }\
        .margin-notes {\
          position: relative;\
        }\
        .tutor-note {\
          background: #fff8f0;\
          border-left: 4px solid #b3643a;\
          padding: 0.8rem;\
          margin-bottom: 1rem;\
          font-size: 0.9rem;\
        }\
        .tutor-note button {\
          background: none;\
          border: none;\
          color: #b3643a;\
          cursor: pointer;\
          font-size: 0.8rem;\
          display: flex;\
          align-items: center;\
        }\
        .suggestions {\
          list-style: disc inside;\
          margin-top: 0.5rem;\
        }\
        .figure {\
          border: 1px solid #ddd;\
          padding: 0.5rem;\
          margin: 1.5rem 0;\
          max-width: 100%;\
        }\
        .figure img {\
          display: block;\
          max-width: 100%;\
          height: auto;\
        }\
        .fig-caption {\
          font-size: 0.85rem;\
          color: #555;\
          margin-top: 0.3rem;\
        }\
        .right-rail {\
          position: sticky;\
          top: 4rem;\
          right: 0;\
          width: 1rem;\
          height: calc(100vh - 4rem);\
          display: flex;\
          flex-direction: column;\
          align-items: center;\
        }\
        .rail-marker {\
          width: 6px;\
          height: 6px;\
          background: #b3643a;\
          border-radius: 50%;\
          margin: 0.8rem 0;\
        }\
      `}</style>
      <div className="top-strip">
        <div>
          <strong>{course.title}</strong> – {lesson.title}
        </div>
        <div>
          Lesson {lesson.eyebrow} • {progress.lessons}/{progress.total} lessons
        </div>
        <button onClick={toggleNote} style={{ background: "none", border: "none", cursor: "pointer" }}>
          {noteOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Tutor Note
        </button>
      </div>
      <div className="content-wrapper">
        <article className="reading-column">
          <h1>{lesson.title}</h1>
          <p>
            In a system of forces, the principle of equilibrium dictates that the vector sum of all forces acting on a body must be zero. This condition ensures that the body experiences no net acceleration and remains at rest or moves with constant velocity. By resolving each force into its horizontal and vertical components, we can verify equilibrium through simple arithmetic.
          </p>
          <p>
            {String.raw`Consider a particle subjected to three forces: F1 = (4.2, -1.8) N, F2 = (-2.0, 1.8) N and F3 = (-2.2, 0) N. Adding the horizontal components gives 4.2 - 2.0 - 2.2 = 0, while the vertical components sum to -1.8 + 1.8 + 0 = 0. The resulting vector ΣF = 0 confirms equilibrium.`}
          </p>
          <figure className="figure">
            <svg className="figure-art" viewBox="0 0 600 130" role="img" aria-label="Force vector sketch on the demo board">
              <g stroke="#b98a62" fill="none">
                <path d="M70 100 L430 30" strokeWidth="2" markerEnd="url(#folio-arrow)" />
                <path d="M70 100 L430 112" strokeWidth="1.5" strokeDasharray="5 5" opacity=".55" />
              </g>
              <circle cx="70" cy="100" r="4" fill="#b98a62" />
              <defs><marker id="folio-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L5,3 L0,6 Z" fill="#b98a62" /></marker></defs>
            </svg>
            <div className="fig-caption">Figure 1 — {boards[0].name}</div>
          </figure>
          <p>
            When equilibrium is achieved, any small disturbance will not cause a net motion unless an external force disrupts the balance. This concept underlies static structures, from bridges to architectural arches, where careful force distribution guarantees stability.
          </p>
        </article>
        <aside className="margin-notes">
          {noteOpen && (
            <section className="tutor-note">
              <strong>AI Tutor Note:</strong>
              <p>Remember: equilibrium requires both \(\Sigma F_x = 0\) and \(\Sigma F_y = 0\). Check each component separately.</p>
            </section>
          )}
          <section className="tutor-note">
            <strong>Suggested actions:</strong>
            <ul className="suggestions">
              {suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      <div className="right-rail">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rail-marker" />
        ))}
      </div>
    </div>
  );
}
