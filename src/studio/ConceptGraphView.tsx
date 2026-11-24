import { useEffect, useState } from "react";
import { ArrowLeft, Network, X } from "lucide-react";
import "./studio.css";
import { API } from "../api";
import MindMapView from "./MindMapView";
import type { MindMapContent, MindMapNode } from "./api";

type Props = {
  courseId: string;
  courseTitle: string;
  onPractice: (node: MindMapNode) => void;
  onOpenSource: (sourceRef: string) => void;
  close: () => void;
};

/** Course-level read-only projection of learning concepts; renders through the Studio mind-map view. */
export default function ConceptGraphView({ courseId, courseTitle, onPractice, onOpenSource, close }: Props) {
  const [graph, setGraph] = useState<MindMapContent | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setGraph(null);
    setError("");
    void fetch(`${API}/concepts/graph?course=${encodeURIComponent(courseId)}`)
      .then(async (response) => {
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((value as { error?: string }).error || "Concepts could not be loaded.");
        return value as MindMapContent;
      })
      .then((value) => { if (live) setGraph(value); })
      .catch(() => { if (live) setError("Concepts could not be loaded right now. Your course material is unchanged. Try again."); });
    return () => { live = false; };
  }, [courseId]);

  return (
    <div className="studio-surface" role="dialog" aria-modal="true" aria-label="Course concept graph" data-testid="concept-graph-surface">
      <aside className="studio-sidebar">
        <div className="studio-brand"><span className="studio-mark"><Network size={16} /></span> studyai <small>concepts</small></div>
        <button className="studio-back" onClick={close}><ArrowLeft size={15} /> Back to workspace</button>
        <div className="studio-group">This course</div>
        <div className="studio-lesson"><strong>{courseTitle}</strong><small>From your learning records</small></div>
        <div className="studio-group">How to read this</div>
        <p className="studio-sidebar-note">Each node is a concept from your course. Mastery comes from your answers and canvas work. Dashed links are relationships saved on your canvases. Practice opens a reviewed question for a weak concept.</p>
      </aside>
      <main className="studio-main">
        <header className="studio-head">
          <div><strong>Concept graph</strong><span>{graph?.title ?? courseTitle}</span></div>
          <button type="button" className="studio-close" onClick={close} aria-label="Close concept graph"><X size={18} /></button>
        </header>
        <div className="studio-body concept-graph-body">
          {error && <div className="studio-error" role="alert" data-testid="concept-graph-error"><p>{error}</p></div>}
          {!graph && !error && <div className="studio-empty" data-testid="concept-graph-loading"><p>Loading concepts from this course…</p></div>}
          {graph && graph.nodes.length === 0 && (
            <div className="studio-empty" data-testid="concept-graph-empty">
              <h2>No concepts yet</h2>
              <p>Answer or author a reviewed question from your course material. Its concept will appear here with its mastery.</p>
            </div>
          )}
          {graph && graph.nodes.length > 0 && (
            <>
              <div className="concept-graph-legend" data-testid="concept-graph-legend">
                <span><b>{graph.nodes.length}</b> concepts</span>
                <span><b>{graph.edges?.length ?? 0}</b> canvas relationships</span>
                <span>Under 50% mastery shows a practice action</span>
              </div>
              <div className="concept-graph" data-testid="concept-graph">
                <MindMapView content={graph} onOpenSource={onOpenSource} onPractice={onPractice} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
