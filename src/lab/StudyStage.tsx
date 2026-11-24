import { useRef, useState } from "react";
import { Activity, ArrowLeft, BookOpen, Layers, Sparkles, X } from "lucide-react";
import { StudyPanel } from "../learning/StudyPanel";
import { useDialogFocus } from "../components/useDialogFocus";

type Props = {
  courseId: string;
  lessonId: string;
  courseTitle: string;
  lessonTitle: string;
  close: () => void;
  onOpenActivities: () => void;
  onOpenSources: () => void;
};

/** Conversation-first secondary surface. The study content is the real
 *  adaptive StudyPanel (questions, FSRS reviews, real course citations). */
export default function StudyStage({ courseId, lessonId, courseTitle, lessonTitle, close, onOpenActivities, onOpenSources }: Props) {
  const [mode, setMode] = useState<"quiz" | "activities" | "sources">("quiz");
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef);
  return (
    <div ref={dialogRef} tabIndex={-1} className="study-stage" role="dialog" aria-modal="true" aria-label="Study session">
      <aside className="stage-sidebar">
        <div className="stage-brand"><span className="stage-mark"><Sparkles size={16} /></span> studyai</div>
        <button className="stage-back" onClick={close}><ArrowLeft size={15} /> Back to canvas</button>
        <div className="stage-group">THIS LESSON</div>
        <button className="stage-session active">{lessonTitle}<small>{courseTitle}</small></button>
        <div className="stage-group">MODES</div>
        <button className={`stage-session ${mode === "quiz" ? "active" : ""}`} aria-current={mode === "quiz" ? "step" : undefined} onClick={() => setMode("quiz")}><Layers size={13} /> Adaptive quiz<small>Reviewed questions + FSRS</small></button>
        <button className={`stage-session ${mode === "activities" ? "active" : ""}`} aria-current={mode === "activities" ? "step" : undefined} onClick={() => { setMode("activities"); onOpenActivities(); }}><Activity size={13} /> Activities<small>Guided canvas tasks</small></button>
        <button className={`stage-session ${mode === "sources" ? "active" : ""}`} aria-current={mode === "sources" ? "step" : undefined} onClick={() => { setMode("sources"); onOpenSources(); }}><BookOpen size={13} /> Course sources<small>Pages and slides</small></button>
      </aside>

      <main className="stage-main">
        <header className="stage-head">
          <div><strong>Study tutor</strong><span>{lessonTitle} · {courseTitle}</span></div>
          <button onClick={close} aria-label="Close study session"><X size={18} /></button>
        </header>
        <div className="stage-body">
          <div style={{ width: "100%", maxWidth: 660, margin: "0 auto" }}>
            <StudyPanel courseId={courseId} lessonId={lessonId} close={close} />
            <p className="stage-tip">Questions and reviews come from your course sources. Ratings schedule the next review locally.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
