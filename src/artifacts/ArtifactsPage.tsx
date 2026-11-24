import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "../components/useDialogFocus";
import { Sparkles } from "lucide-react";
import {
  deleteSlideDeck,
  downloadSlideDeckUrl,
  generateSlideDeck,
  getSlideDeck,
  listSlideDecks,
  updateSlideDeck,
  type SlideDeckArtifact,
} from "./api";
import { sourceLabel } from "../studio/api";
import "./artifacts.css";
import { SurfaceHeader, SurfaceNotice } from "../components/SurfaceChrome";

type Props = {
  courseId: string;
  lessonId: string;
  courseTitle: string;
  lessonTitle: string;
  close: () => void;
  onOpenSource: (sourceRef: string) => void;
  onOpenStudio: () => void;
};

type Notice = { tone: "info" | "error" | "success"; text: string };
type Busy = "loading" | "generating" | "opening" | "saving" | "deleting" | undefined;

const FALLBACK = "We couldn't finish that. Try again in a moment.";
const RENDER_MISSING = "The local presentation service (Presenton) isn't running. Slides and citations are ready to review; start the service and build again to download a .pptx.";

function studentMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  if (/No course sources/i.test(raw)) return "This lesson has no course material to build a deck from yet. Add a source or notes first.";
  if (/validation failed|repair/i.test(raw)) return "The deck didn't pass the course-material checks. Try a different focus or source.";
  if (/presenton|presentation service|renderer|502|503/i.test(raw)) return RENDER_MISSING;
  return FALLBACK;
}

function deckFileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `${slug || "study-deck"}.pptx`;
}

export default function ArtifactsPage({ courseId, lessonId, courseTitle, lessonTitle, close, onOpenSource, onOpenStudio }: Props) {
  const [items, setItems] = useState<SlideDeckArtifact[]>([]);
  const [selected, setSelected] = useState<SlideDeckArtifact | undefined>();
  const [filter, setFilter] = useState("");
  const [focus, setFocus] = useState("");
  const [rename, setRename] = useState("");
  const [notice, setNotice] = useState<Notice | undefined>();
  const [busy, setBusy] = useState<Busy>("loading");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef);

  const refresh = useCallback(() => {
    void listSlideDecks(courseId)
      .then(setItems)
      .catch((error: unknown) => setNotice({ tone: "error", text: studentMessage(error) }))
      .finally(() => setBusy(undefined));
  }, [courseId]);

  useEffect(refresh, [refresh]);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => `${item.collection} ${item.title}`.toLowerCase().includes(query));
  }, [items, filter]);

  const generate = () => {
    if (busy) return;
    setBusy("generating");
    setNotice({ tone: "info", text: "Building your deck from this lesson…" });
    void generateSlideDeck({ courseId, lessonId, focus: focus.trim() || lessonTitle || "Key concepts and mechanisms" })
      .then((artifact) => {
        const degraded = !artifact.filePath;
        const reason = degraded && "notice" in artifact && typeof artifact.notice === "string" ? artifact.notice : RENDER_MISSING;
        setNotice({ tone: degraded ? "info" : "success", text: degraded ? reason : "Deck ready. Open it below to review slides and speaker notes." });
        setSelected(artifact);
        setRename(artifact.title);
        setConfirmDelete(false);
        return listSlideDecks(courseId).then(setItems);
      })
      .catch((error: unknown) => setNotice({ tone: "error", text: studentMessage(error) }))
      .finally(() => setBusy(undefined));
  };

  const open = (id: string) => {
    if (busy) return;
    setBusy("opening");
    void getSlideDeck(id, courseId)
      .then((artifact) => {
        setSelected(artifact);
        setRename(artifact.title);
        setConfirmDelete(false);
        setNotice(undefined);
      })
      .catch((error: unknown) => setNotice({ tone: "error", text: studentMessage(error) }))
      .finally(() => setBusy(undefined));
  };

  const save = () => {
    if (!selected || busy || !rename.trim()) return;
    setBusy("saving");
    void updateSlideDeck(selected.id, courseId, { title: rename.trim(), collection: selected.collection })
      .then((updated) => {
        setSelected(updated);
        setNotice({ tone: "success", text: "Deck name saved." });
        return listSlideDecks(courseId).then(setItems);
      })
      .catch((error: unknown) => setNotice({ tone: "error", text: studentMessage(error) }))
      .finally(() => setBusy(undefined));
  };

  const remove = () => {
    if (!selected || busy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setNotice({ tone: "info", text: "Delete this deck? Select Delete again to confirm." });
      return;
    }
    setBusy("deleting");
    void deleteSlideDeck(selected.id, courseId)
      .then(() => {
        setSelected(undefined);
        setConfirmDelete(false);
        setNotice({ tone: "success", text: "Deck deleted." });
        return listSlideDecks(courseId).then(setItems);
      })
      .catch((error: unknown) => setNotice({ tone: "error", text: studentMessage(error) }))
      .finally(() => setBusy(undefined));
  };

  return (
    <div className="artifacts-surface" data-testid="artifacts-surface">
      <div ref={dialogRef} tabIndex={-1} className="artifacts-shell" data-testid="artifacts-page" role="dialog" aria-modal="true" aria-label="Artifacts">
        <SurfaceHeader
          eyebrow="Artifacts"
          title="Artifacts"
          subtitle={`Study decks made from ${lessonTitle || courseTitle} material.`}
          backLabel="Back to workspace"
          onBack={close}
          onClose={close}
          closeLabel="Close artifacts"
          className="artifacts-head"
        >
          <button type="button" className="surface-link" data-testid="artifacts-open-studio" onClick={onOpenStudio}>
            <Sparkles size={15} strokeWidth={1.9} aria-hidden="true" /> Studio
          </button>
        </SurfaceHeader>

        <section className="artifacts-create" aria-label="Build a slide deck">
          <details>
            <summary>Advanced</summary>
            <label htmlFor="deck-focus">What should this deck focus on?</label>
            <div className="artifacts-create-row">
              <input
                id="deck-focus"
                data-testid="deck-focus"
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                placeholder="Key concepts and mechanisms"
                maxLength={500}
              />
            </div>
          </details>
          <button className="button-primary" data-testid="deck-generate" onClick={generate} disabled={!!busy}>
            {busy === "generating" ? "Building…" : "Build slide deck"}
          </button>
        </section>

        <SurfaceNotice
          tone={notice?.tone ?? "info"}
          text={busy === "loading" ? "Loading your decks…" : notice?.text ?? ""}
          testId="artifacts-status"
          className={`artifacts-status artifacts-status-${notice?.tone ?? "info"}`}
        />

        <div className="artifacts-layout">
          <section className="artifacts-list" aria-label="Saved decks">
            <label htmlFor="artifact-filter">Filter decks</label>
            <input
              id="artifact-filter"
              data-testid="artifact-filter-collection"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Collection or title"
            />
            {busy !== "loading" && visible.length === 0 && (
              <p className="artifacts-empty" data-testid="artifacts-empty">
                {items.length === 0 ? "No decks yet. Set a focus above to build one from this lesson." : "No decks match that filter."}
              </p>
            )}
            {visible.map((item) => (
              <article className="artifact-row" data-testid="artifact-row" key={item.id}>
                <div><b>{item.title}</b><small>{item.kind.replace("_", " ")} · {new Date(item.createdAt).toLocaleDateString()}</small></div>
                <button className="button-soft" data-testid="artifact-open" onClick={() => open(item.id)} disabled={!!busy}>Open slides</button>
              </article>
            ))}
          </section>

          <section className="artifacts-detail" aria-label="Deck preview">
            {!selected && <p className="artifacts-empty">Choose a deck to see its slides and speaker notes.</p>}
            {selected && <>
              <div className="artifacts-detail-head">
                <div><h3>{selected.title}</h3><small>{selected.content.slides.length} slides · {selected.sourceRefs.length} cited sources</small></div>
                {selected.filePath ? (
                  <a
                    className="button-soft"
                    data-testid="artifact-download"
                    href={downloadSlideDeckUrl(selected.id, selected.courseId)}
                    download={deckFileName(selected.title)}
                  >Download .pptx</a>
                ) : (
                  <button type="button" className="button-soft" data-testid="artifact-download-unavailable" aria-describedby="artifact-download-note" disabled>Download unavailable</button>
                )}
              </div>
              {!selected.filePath && <p id="artifact-download-note" className="artifacts-empty" data-testid="artifact-download-note">{RENDER_MISSING}</p>}
              <div className="artifacts-rename">
                <label htmlFor="artifact-title">Deck name</label>
                <input id="artifact-title" data-testid="artifact-rename" aria-label="Artifact title" value={rename} onChange={(event) => setRename(event.target.value)} maxLength={200} />
                <button className="button-primary" data-testid="artifact-save" onClick={save} disabled={!!busy || !rename.trim()}>Save</button>
                <button className="button-soft" data-testid="artifact-delete" onClick={remove} disabled={!!busy}>
                  {confirmDelete ? "Confirm delete" : "Delete"}
                </button>
              </div>
              <div className="slide-grid">
                {selected.content.slides.map((slide, index) => (
                  <article className="slide-card" data-testid="slide-card" key={`${selected.id}-${index}`}>
                    <small>{slide.role}</small>
                    <h4>{slide.title}</h4>
                    {slide.visual && <div className="slide-visual" aria-label={`Visual: ${slide.visual.altText}`}><span>Visual</span>{slide.visual.altText}</div>}
                    {slide.claims.map((claim) => (
                      <div className="slide-claim" key={claim.sourceRef}>
                        <p>{claim.claim}</p>
                        <button className="slide-citation surface-provenance" data-testid="slide-citation" onClick={() => onOpenSource(claim.sourceRef)}>
                          Open source · {sourceLabel(claim.sourceRef)}
                        </button>
                      </div>
                    ))}
                    {slide.notes && <p className="slide-notes"><strong>Speaker notes</strong>{slide.notes}</p>}
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
