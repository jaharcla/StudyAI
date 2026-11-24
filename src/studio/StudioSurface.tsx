import { useEffect, useState } from "react";
import {
  ArrowLeft, BookOpen, ChartColumn, Check, CircleAlert, CircleCheck, Download,
  ListTree, LoaderCircle, Sparkles, X,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import "./studio.css";
import {
  acceptArtifact, generateArtifact, listArtifacts, type AcceptanceDecision, type MindMapContent,
  type PracticeContent, type PracticeType, type StudioArtifact, type StudioKind, type StudyGuideContent,
  type InfographicContent,
} from "./api";
import MindMapView from "./MindMapView";
import StudyGuideView from "./StudyGuideView";
import PracticeView from "./PracticeView";
import InfographicView from "./InfographicView";

const KIND_LABEL: Record<StudioKind, string> = {
  "mind-map": "Mind map",
  "study-guide": "Study guide",
  infographic: "Infographic",
  practice: "Practice",
};

const TABS: Array<{ id: StudioKind; label: string; icon: typeof Sparkles }> = [
  { id: "mind-map", label: "Mind map", icon: ListTree },
  { id: "study-guide", label: "Study guide", icon: BookOpen },
  { id: "infographic", label: "Infographic", icon: ChartColumn },
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
  const [filter, setFilter] = useState<StudioKind | "all">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorAction, setErrorAction] = useState<"generate" | "accept">("generate");

  useEffect(() => {
    let live = true;
    void listArtifacts(courseId, lessonId).then((items) => { if (live) setHistory(items); }).catch(() => { if (live) setHistory([]); });
    return () => { live = false; };
  }, [courseId, lessonId]);

  const generate = async () => {
    setBusy(true); setError(""); setErrorAction("generate");
    try {
      const created = await generateArtifact({ courseId, lessonId, kind, focus: focus.trim() || "Key concepts and mechanisms", practiceType, count });
      setArtifact(created);
      setFilter("all");
      setHistory((items) => [created, ...items].slice(0, 20));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const shown = artifact?.kind === kind ? artifact : history.find((item) => item.kind === kind);
  const visibleHistory = filter === "all" ? history : history.filter((item) => item.kind === filter);
  const acceptance: AcceptanceDecision = shown?.acceptance ?? "pending";

  const accept = async () => {
    if (!shown) return;
    setError(""); setErrorAction("accept");
    try {
      const updated = await acceptArtifact(shown.id, "accept");
      setHistory((items) => items.map((item) => item.id === updated.id ? updated : item));
      setArtifact((current) => current?.id === updated.id ? updated : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Accept failed.");
    }
  };

  const download = () => {
    if (!shown) return;
    const svg = shown.kind === "infographic" ? document.querySelector('[data-testid="infographic-svg"]') : null;
    const blob = svg
      ? new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" })
      : new Blob([JSON.stringify(shown, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: `${shown.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.${svg ? "svg" : "json"}` });
    link.click();
    URL.revokeObjectURL(url);
  };

  const retry = () => { if (errorAction === "accept") void accept(); else void generate(); };

  return (
    <div className="studio-surface" role="dialog" aria-modal="true" aria-label="StudyAI Studio" data-testid="studio-surface">
      <aside className="studio-sidebar">
        <div className="studio-brand"><span className="studio-mark"><Sparkles size={16} /></span> studyai <small>studio</small></div>
        <button className="studio-back" onClick={close}><ArrowLeft size={15} /> Back to workspace</button>

        <div className="studio-group">This lesson</div>
        <div className="studio-lesson"><strong>{lessonTitle}</strong><small>{courseTitle}</small></div>

        <div className="studio-group">Create</div>
        <nav className="studio-tabs" aria-label="Artifact type">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" data-testid={`studio-tab-${tab.id}`} className={kind === tab.id ? "active" : ""}
              aria-current={kind === tab.id ? "true" : undefined} onClick={() => setKind(tab.id)}>
              <tab.icon size={16} strokeWidth={1.8} aria-hidden="true" /> <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="studio-group">Generate from</div>
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
        <button type="button" className="studio-primary studio-generate" data-testid="studio-generate" disabled={busy} aria-busy={busy} onClick={() => void generate()}>
          {busy ? <LoaderCircle size={15} strokeWidth={2} aria-hidden="true" /> : <Sparkles size={15} strokeWidth={1.8} aria-hidden="true" />}
          {busy ? "Generating…" : `Generate ${KIND_LABEL[kind].toLowerCase()}`}
        </button>

        {history.length > 0 && (
          <>
            <div className="studio-group studio-group-row"><span>Artifacts</span><span className="studio-count">{visibleHistory.length}</span></div>
            <label className="studio-field studio-filter">Filter
              <select data-testid="artifact-filter" value={filter} onChange={(event) => setFilter(event.target.value as StudioKind | "all")}>
                <option value="all">All artifacts</option>
                {TABS.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
              </select>
            </label>
            <div className="studio-history" data-testid="artifact-list">
              {visibleHistory.map((item) => (
                <button key={item.id} type="button" data-testid="artifact-list-item" className={shown?.id === item.id ? "active" : ""}
                  aria-current={shown?.id === item.id ? "true" : undefined}
                  onClick={() => { setKind(item.kind); setArtifact(item); }}>
                  <span>{item.title}</span>
                  <small>{KIND_LABEL[item.kind]}{item.acceptance === "accept" ? " · Accepted" : ""}</small>
                </button>
              ))}
              {visibleHistory.length === 0 && (
                <p className="studio-list-empty" data-testid="artifact-list-empty">No {filter === "all" ? "" : `${KIND_LABEL[filter].toLowerCase()} `}artifacts yet.</p>
              )}
            </div>
          </>
        )}
        <p className="studio-sidebar-note">Every item keeps a citation you can open.</p>
      </aside>

      <main className="studio-main">
        <header className="studio-head">
          <div><strong>StudyAI Studio</strong><span>{lessonTitle} · {courseTitle}</span></div>
          <button type="button" className="studio-close" onClick={close} aria-label="Close Studio"><X size={18} /></button>
        </header>
        <div className="studio-body" aria-busy={busy}>
          {error && (
            <div className="studio-error" role="alert" data-testid="studio-error">
              <CircleAlert size={18} strokeWidth={1.9} aria-hidden="true" />
              <div>
                <strong>That didn't go through</strong>
                <p>{error}</p>
                <button type="button" className="studio-error-retry" onClick={retry}>Try again</button>
              </div>
            </div>
          )}

          {busy && (
            <div className="studio-loading" role="status" aria-live="polite" data-testid="studio-loading">
              <LoaderCircle size={19} strokeWidth={1.8} aria-hidden="true" />
              <div>
                <strong>Preparing your {KIND_LABEL[kind].toLowerCase()}…</strong>
                <p>Reading this lesson's sources and building citations.</p>
              </div>
              <span className="studio-progress" aria-hidden="true" />
            </div>
          )}

          {!busy && shown && (
            <div className="studio-artifact-bar">
              <div className="studio-artifact-heading">
                <span className="studio-kind" data-testid="artifact-kind">{KIND_LABEL[shown.kind]}</span>
                {(shown.kind === "mind-map" || shown.kind === "practice")
                  ? <h2>{shown.title}</h2>
                  : <span className="studio-artifact-context">From this lesson</span>}
              </div>
              <div className="studio-artifact-actions">
                <span className={`studio-review-status${acceptance === "accept" ? " accepted" : ""}`} data-testid="artifact-status" aria-live="polite">
                  {acceptance === "accept"
                    ? <><CircleCheck size={14} strokeWidth={2} aria-hidden="true" /><span data-testid="artifact-acceptance">Accepted</span></>
                    : "Awaiting review"}
                </span>
                <button type="button" className="studio-toolbar-button" data-testid="artifact-accept" disabled={acceptance === "accept"} onClick={() => void accept()}>
                  {acceptance === "accept" ? <CircleCheck size={15} strokeWidth={2} aria-hidden="true" /> : <Check size={15} strokeWidth={2} aria-hidden="true" />}
                  {acceptance === "accept" ? "Accepted" : "Accept"}
                </button>
                <button type="button" className="studio-toolbar-button" data-testid="artifact-download" onClick={download}>
                  <Download size={15} strokeWidth={1.9} aria-hidden="true" /> Download
                </button>
              </div>
            </div>
          )}

          {!busy && !shown && (
            <div className="studio-empty" data-testid="studio-empty">
              <span className="studio-empty-icon"><Sparkles size={22} strokeWidth={1.7} aria-hidden="true" /></span>
              <h2>Make this lesson easier to review</h2>
              <p>Turn the sources, concepts and canvas for this lesson into a study guide, mind map, infographic or practice set. Each item keeps a citation you can open.</p>
              <button type="button" className="studio-primary" onClick={() => void generate()}>Generate a {KIND_LABEL[kind].toLowerCase()}</button>
            </div>
          )}

          {!busy && shown?.kind === "mind-map" && <MindMapView content={shown.content as MindMapContent} onOpenSource={onOpenSource} />}
          {!busy && shown?.kind === "study-guide" && <StudyGuideView content={shown.content as StudyGuideContent} onOpenSource={onOpenSource} />}
          {!busy && shown?.kind === "infographic" && <InfographicView content={shown.content as InfographicContent} onOpenSource={onOpenSource} />}
          {!busy && shown?.kind === "practice" && <PracticeView artifactId={shown.id} content={shown.content as PracticeContent} onOpenSource={onOpenSource} />}
        </div>
      </main>
    </div>
  );
}
