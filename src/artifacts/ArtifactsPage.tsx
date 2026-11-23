import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { deleteSlideDeck, downloadSlideDeckUrl, getSlideDeck, listSlideDecks, updateSlideDeck, type SlideDeckArtifact } from "./api";
import { sourceLabel } from "../studio/api";
import "./artifacts.css";

type Props = {
  courseId: string;
  lessonId: string;
  courseTitle: string;
  lessonTitle: string;
  close: () => void;
  onOpenSource: (sourceRef: string) => void;
};

export default function ArtifactsPage({ courseId, close, onOpenSource }: Props) {
  const [items, setItems] = useState<SlideDeckArtifact[]>([]);
  const [selected, setSelected] = useState<SlideDeckArtifact | undefined>();
  const [collection, setCollection] = useState("");
  const [rename, setRename] = useState("");
  const [status, setStatus] = useState("");

  const refresh = useCallback(() => {
    void listSlideDecks(courseId).then(setItems).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Could not load artifacts.");
    });
  }, [courseId]);

  useEffect(refresh, [refresh]);

  const visible = useMemo(() => items.filter((item) => !collection || item.collection === collection), [items, collection]);

  const open = (id: string) => {
    void getSlideDeck(id, courseId).then((artifact) => {
      setSelected(artifact);
      setRename(artifact.title);
    }).catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not open artifact."));
  };

  const save = () => {
    if (!selected) return;
    void updateSlideDeck(selected.id, courseId, { title: rename, collection: selected.collection })
      .then((updated) => { setSelected(updated); refresh(); })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not save artifact."));
  };

  const remove = () => {
    if (!selected) return;
    void deleteSlideDeck(selected.id, courseId)
      .then(() => { setSelected(undefined); refresh(); })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not delete artifact."));
  };

  return (
    <div className="artifacts-surface" data-testid="artifacts-surface">
      <div className="artifacts-shell" data-testid="artifacts-page">
        <header className="artifacts-head">
          <div><span className="eyebrow">SAVED WORK</span><h2>Artifacts</h2><p>Study decks and other work generated from your course material.</p></div>
          <button className="icon-button" onClick={close} aria-label="Close artifacts"><X size={18} /></button>
        </header>
        {status && <p className="artifacts-status" role="status">{status}</p>}
        <div className="artifacts-layout">
          <section className="artifacts-list">
            <label>Collection<input data-testid="artifact-filter-collection" value={collection} onChange={(event) => setCollection(event.target.value)} placeholder="All collections" /></label>
            {visible.length === 0 && <p className="artifacts-empty">No artifacts yet.</p>}
            {visible.map((item) => (
              <article className="artifact-row" data-testid="artifact-row" key={item.id}>
                <div><b>{item.title}</b><small>{item.kind} · {new Date(item.createdAt).toLocaleDateString()}</small></div>
                <button className="button-soft" data-testid="artifact-open" onClick={() => open(item.id)}>Open slides</button>
              </article>
            ))}
          </section>
          <section className="artifacts-detail">
            {!selected && <p className="artifacts-empty">Choose an artifact to see its slides.</p>}
            {selected && <>
              <div className="artifacts-detail-head">
                <div><h3>{selected.title}</h3><small>{selected.content.slides.length} slides · {selected.sourceRefs.length} citations</small></div>
                <a className="button-soft" data-testid="artifact-download" href={downloadSlideDeckUrl(selected.id, selected.courseId)}>Download .pptx</a>
              </div>
              <div className="artifacts-rename">
                <input data-testid="artifact-rename" aria-label="Artifact title" value={rename} onChange={(event) => setRename(event.target.value)} />
                <button className="button-primary" data-testid="artifact-save" onClick={save}>Save</button>
                <button className="button-soft" data-testid="artifact-delete" onClick={remove}>Delete</button>
              </div>
              <div className="slide-grid">
                {selected.content.slides.map((slide, index) => (
                  <article className="slide-card" data-testid="slide-card" key={`${selected.id}-${index}`}>
                    <small>{slide.role}</small>
                    <h4>{slide.title}</h4>
                    {slide.visual && <div className="slide-visual" aria-label={slide.visual.altText}>{slide.visual.altText}</div>}
                    {slide.claims.map((claim) => (
                      <div className="slide-claim" key={claim.sourceRef}>
                        <p>{claim.claim}</p>
                        <button className="slide-citation" data-testid="slide-citation" onClick={() => onOpenSource(claim.sourceRef)}>Open source · {sourceLabel(claim.sourceRef)}</button>
                      </div>
                    ))}
                    {slide.notes && <p className="slide-notes">{slide.notes}</p>}
                  </article>
                ))}
              </div>
            </>}
          </section>
        </div>
      </div>
    </div>
  );
}
