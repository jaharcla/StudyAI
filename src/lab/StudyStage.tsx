import { useRef, useState } from "react";
import { Activity, BookOpen, Layers, Sparkles } from "lucide-react";
import { StudyPanel } from "../learning/StudyPanel";
import { useDialogFocus } from "../components/useDialogFocus";
import { SurfaceHeader } from "../components/SurfaceChrome";

type Props = {
  courseId: string;
  lessonId: string;
  courseTitle: string;
  lessonTitle: string;
  close: () => void;
  onOpenActivities: () => void;
  onOpenCards: () => void;
  onOpenSources: () => void;
  onOpenSource: (sourceRef: string) => void;
};

/** Conversation-first secondary surface. The study content is the real
 *  adaptive StudyPanel (questions, FSRS reviews, real course citations). */
export default function StudyStage({ courseId, lessonId, courseTitle, lessonTitle, close, onOpenActivities, onOpenCards, onOpenSources, onOpenSource }: Props) {
  const [mode, setMode] = useState<"quiz" | "activities" | "sources">("quiz");
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef);
  return (
    <div ref={dialogRef} tabIndex={-1} className="study-stage" role="dialog" aria-modal="true" aria-label="Study session">
      <aside className="stage-sidebar">
        <div className="stage-brand"><span className="stage-mark"><Sparkles size={16} /></span> studyai</div>
        <div className="stage-group">THIS LESSON</div>
        <button className="stage-session active">{lessonTitle}<small>{courseTitle}</small></button>
        <div className="stage-group">MODES</div>
        <button className={`stage-session ${mode === "quiz" ? "active" : ""}`} aria-current={mode === "quiz" ? "step" : undefined} onClick={() => setMode("quiz")}><Layers size={13} /> Adaptive quiz<small>Reviewed questions + FSRS</small></button>
        <button className="stage-session" data-testid="study-cards-mode" onClick={onOpenCards}><BookOpen size={13} /> Cards<small>Flashcards and review</small></button>
        <button className={`stage-session ${mode === "activities" ? "active" : ""}`} aria-current={mode === "activities" ? "step" : undefined} onClick={() => { setMode("activities"); onOpenActivities(); }}><Activity size={13} /> Activities<small>Guided canvas tasks</small></button>
        <button className={`stage-session ${mode === "sources" ? "active" : ""}`} aria-current={mode === "sources" ? "step" : undefined} onClick={() => { setMode("sources"); onOpenSources(); }}><BookOpen size={13} /> Course sources<small>Pages and slides</small></button>
      </aside>

      <main className="stage-main">
        <SurfaceHeader
          eyebrow="Study"
          title="Study tutor"
          subtitle={`${lessonTitle} · ${courseTitle}`}
          backLabel="Back to canvas"
          onBack={close}
          onClose={close}
          closeLabel="Close study session"
          backClassName="stage-back"
        />
        <div className="stage-body">
          <div style={{ width: "100%", maxWidth: 660, margin: "0 auto" }}>
            <StudyPanel courseId={courseId} lessonId={lessonId} lessonTitle={lessonTitle} close={close} onOpenSource={onOpenSource} />
            <p className="stage-tip">Questions and reviews come from your course sources. Ratings schedule the next review locally.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
