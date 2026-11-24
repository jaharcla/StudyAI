import { useEffect, useRef, useState } from "react";
import { Brain, X } from "lucide-react";
import { API } from "../api";
import { useDialogFocus } from "./useDialogFocus";
import type { CourseProgress } from "../../server/progress.js";

export default function ProgressDialog({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(true, dialogRef);

  useEffect(() => {
    let live = true;
    fetch(`${API}/progress?course=${encodeURIComponent(courseId)}`)
      .then(async (response) => {
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(value.error || "Progress could not be loaded.");
        return value as CourseProgress;
      })
      .then((value) => { if (live) setProgress(value); })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : "Progress could not be loaded."); });
    return () => { live = false; };
  }, [courseId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const empty = progress && progress.totalAttempts === 0 && progress.conceptsMastered === 0;

  return (
    <div className="modal-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} className="settings-modal progress-modal" role="dialog" aria-label="Learning progress" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">LOCAL STUDY DATA</span><h2>Learning progress</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close progress"><X size={18} /></button>
        </div>
        {error && <p role="alert">{error}</p>}
        {!progress && !error && <p className="progress-note">Loading…</p>}
        {empty && <p className="progress-note">No study activity yet — answer a question or start an activity.</p>}
        {progress && !empty && (
          <>
            <div className="progress-stats">
              <div><b>{progress.totalAttempts}</b><span>Questions answered</span></div>
              <div><b>{progress.totalCorrect}</b><span>Correct</span></div>
              <div><b>{progress.conceptsMastered}</b><span>Concepts mastered</span></div>
              <div><b>{progress.dueReviews}</b><span>Reviews due</span></div>
            </div>
            <h3 className="progress-heading">By lesson</h3>
            <div className="progress-lessons">
              {progress.lessons.map((lesson: CourseProgress["lessons"][number]) => (
                <div key={lesson.id} className="progress-lesson">
                  <div><span>{lesson.title}</span><small>{lesson.correct}/{lesson.attempts} correct</small></div>
                  <div className="progress-bar"><i style={{ width: `${Math.round(lesson.mastery * 100)}%` }} /></div>
                </div>
              ))}
            </div>
            <p className="progress-note"><Brain size={12} /> Computed from your local study attempts and mastery records.</p>
          </>
        )}
      </section>
      <style>{`
        .progress-modal{width:min(560px,92vw)}
        .progress-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}
        .progress-stats div{display:grid;gap:3px;padding:12px;border:1px solid #e8e2d8;border-radius:9px;background:#fbf9f4}
        .progress-stats b{font:600 20px Georgia,serif}
        .progress-stats span{color:#645b4e;font-size:9px}
        .progress-heading{margin:18px 0 8px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6b6256}
        .progress-lessons{display:grid;gap:8px;max-height:38vh;overflow:auto}
        .progress-lesson{display:grid;gap:5px}
        .progress-lesson>div:first-child{display:flex;justify-content:space-between;font-size:11px}
        .progress-lesson small{color:#6b6256;font-size:9px}
        .progress-bar{height:5px;border-radius:99px;background:#ece6dc;overflow:hidden}
        .progress-bar i{display:block;height:100%;background:#7a452e}
        .progress-note{display:flex;align-items:center;gap:6px;margin:14px 2px 0;color:#8a8072;font-size:10px}
      `}</style>
    </div>
  );
}
