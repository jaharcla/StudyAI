import { useEffect, useState } from "react";
import { ArrowLeft, Layers, ListTree, Sparkles, X } from "lucide-react";
import "@xyflow/react/dist/style.css";
import "./studio.css";
import { generateArtifact, listArtifacts, type MindMapContent, type PracticeContent, type PracticeType, type StudioArtifact, type StudioKind, type StudyGuideContent } from "./api";
import MindMapView from "./MindMapView";
import StudyGuideView from "./StudyGuideView";
import PracticeView from "./PracticeView";

const TABS: Array<{ id: StudioKind; label: string; icon: typeof Layers }> = [
  { id: "mind-map", label: "Mind map", icon: ListTree },
  { id: "study-guide", label: "Study guide", icon: Layers },
  { id: "practice", label: "Practice", icon: Sparkles },
];

type Props = {
  courseId: string; lessonId: string; courseTitle: string; lessonTitle: string;
  onOpenSource: (sourceRef: string) => void; close: () => void;
};

export default function StudioSurface({ courseId, lessonId, courseTitle, lessonTitle, onOpenSource, close }: Props) {
  const [kind, setKind] = useState<StudioKind>("mind-map");
  const [focus, setFocus] = useState("");
  const [practiceType, setPracticeType] = useState<PracticeType>("both");
  const [count, setCount] = useState(4);
  const [artifact, setArtifact] = useState<StudioArtifact | undefined>();
  const [history, setHistory] = useState<StudioArtifact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void listArtifacts(courseId, lessonId).then((items) => { if (live) setHistory(items); }).catch(() => { if (live) setHistory([]); });
    return () => { live = false; };
  }, [courseId, lessonId]);

  const generate = async () => {
    setBusy(true); setError("");
    try {
      const created = await generateArtifact({ courseId, lessonId, kind, focus: focus.trim() || "Key concepts and mechanisms", practiceType, count });
      setArtifact(created);
      setHistory((items) => [created, ...items].slice(0, 20));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const shown = artifact?.kind === kind ? artifact : history.find((item) => item.kind === kind);

  return (
    <div className="studio-surface" role="dialog" aria-modal="true" aria-label="StudyAI Studio" data-testid="studio-surface">
      <aside className="studio-sidebar">
        <div className="studio-brand"><span className="studio-mark"><Sparkles size={16} /></span> studyai <small>studio</small></div>
        <button className="studio-back" onClick={close}><ArrowLeft size={15} /> Back to workspace</button>
        <div className="studio-group">THIS LESSON</div>
        <div className="studio-lesson">{lessonTitle}<small>{courseTitle}</small></div>
        <div className="studio-group">CREATE</div>
        <nav className="studio-tabs">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" data-testid={`studio-tab-${tab.id}`} className={kind === tab.id ? "active" : ""} onClick={() => setKind(tab.id)}>
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </nav>
        <div className="studio-group">GENERATE FROM</div>
        <label className="studio-field">Focus
          <input data-testid="studio-focus" value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="e.g. equilibrium and forces" />
        </label>
        {kind === "practice" && (
          <>
            <label className="studio-field">Items
              <select value={practiceType} onChange={(event) => setPracticeType(event.target.value as PracticeType)}>
                <option value="both">Cards and quiz</option><option value="cards">Flashcards only</option><option value="quiz">Quiz only</option>
              </select>
            </label>
            <label className="studio-field">Count
              <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                {[2, 3, 4, 6, 8].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </>
        )}
        <button type="button" className="studio-primary studio-generate" data-testid="studio-generate" disabled={busy} onClick={() => void generate()}>
          <Sparkles size={14} /> {busy ? "Generating…" : `Generate ${TABS.find((tab) => tab.id === kind)?.label.toLowerCase()}`}
        </button>
        {history.length > 0 && <div className="studio-group">RECENT</div>}
        <div className="studio-history">
          {history.map((item) => (
            <button key={item.id} type="button" className={shown?.id === item.id ? "active" : ""} onClick={() => { setKind(item.kind); setArtifact(item); }}>
              {item.title}<small>{item.kind}</small>
            </button>
          ))}
        </div>
      </aside>

      <main className="studio-main">
        <header className="studio-head">
          <div><strong>StudyAI Studio</strong><span>{lessonTitle} · {courseTitle}</span></div>
          <button type="button" onClick={close} aria-label="Close Studio"><X size={18} /></button>
        </header>
        <div className="studio-body">
          {error && <p className="studio-error" role="alert">{error}</p>}
          {!shown && (
            <div className="studio-empty">
              <Sparkles size={26} />
              <h3>Turn your sources into study material</h3>
              <p>Studio builds a mind map, study guide, or practice from this lesson's documents, concepts and canvas — with a citation on every item.</p>
              <button type="button" className="studio-primary" onClick={() => void generate()}>Generate now</button>
            </div>
          )}
          {shown?.kind === "mind-map" && <MindMapView content={shown.content as MindMapContent} onOpenSource={onOpenSource} />}
          {shown?.kind === "study-guide" && <StudyGuideView content={shown.content as StudyGuideContent} onOpenSource={onOpenSource} />}
          {shown?.kind === "practice" && <PracticeView artifactId={shown.id} content={shown.content as PracticeContent} onOpenSource={onOpenSource} />}
        </div>
      </main>
    </div>
  );
}
