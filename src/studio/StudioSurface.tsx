import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogFocus } from "../components/useDialogFocus";
import {
  BookOpen, ChartColumn, Check, CircleAlert, CircleCheck, Download,
  ListTree, LoaderCircle, Sparkles,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import "./studio.css";
import "../artifacts/artifacts.css";
import { SurfaceHeader, SurfaceNotice } from "../components/SurfaceChrome";
import {
  acceptArtifact, generateArtifact, listArtifacts, sourceLabel, type AcceptanceDecision,
  type MindMapContent, type PracticeType, type StudioArtifact, type StudioKind,
  type StudyGuideContent, type InfographicContent,
} from "./api";
import {
  deleteSlideDeck, downloadSlideDeckUrl, generateSlideDeck, getSlideDeck,
  listSlideDecks, updateSlideDeck, type SlideDeckArtifact,
} from "../artifacts/api";
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

const MADE_KIND_LABEL: Record<StudioKind | "slide_deck", string> = {
  ...KIND_LABEL,
  slide_deck: "Slide deck",
};

const MADE_FILTERS: Array<{ id: MadeKind | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "mind-map", label: "Mind maps" },
  { id: "study-guide", label: "Study guides" },
  { id: "infographic", label: "Infographics" },
  { id: "practice", label: "Practice" },
  { id: "slide_deck", label: "Slide decks" },
];

const FORMAT_ERROR = "The study assistant couldn't turn this lesson's material into an artifact this time. Your course material is unchanged. Try again or choose another artifact type.";
const RENDER_MISSING = "The local presentation service (Presenton) isn't running. Slides and citations are ready to review; start the service and build again to download a .pptx.";

type Note = { tone: "info" | "error" | "success"; text: string };
type MadeKind = StudioKind | "slide_deck";
type MadeItem = {
  key: string;
  id: string;
  kind: MadeKind;
  title: string;
  createdAt: string;
  source: "studio" | "deck";
  studio?: StudioArtifact;
};

type Props = {
  courseId: string; lessonId: string; courseTitle: string; lessonTitle: string;
  onOpenSource: (sourceRef: string) => void; close: () => void;
  /** Optional material focus prepared by the Coach from a cited source. */
  initialFocus?: string;
  /** Optional artifact to select when a caller hands off. */
  initialArtifactId?: string;
  /** Optional deck to select when a caller hands off. */
  initialDeckId?: string;
};

function studentMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const status = (error as { status?: number } | null)?.status;
  if (/did not return a JSON|couldn't format a response|could not format|study assistant couldn't/i.test(raw)) return FORMAT_ERROR;
  if (/No course sources|No grounded/i.test(raw)) return "This lesson doesn't have enough course material yet. Add a source or notes, then try again.";
  if (status === 502 || status === 503 || /502|503|fetch failed|network/i.test(raw)) return "The study assistant isn't responding right now. Your course material is unchanged. Try again in a moment.";
  return "Generation didn't complete. Your course material is unchanged. Try again.";
}

function deckMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  if (/No course sources/i.test(raw)) return "This lesson has no course material to build a deck from yet. Add a source or notes first.";
  if (/validation failed|repair/i.test(raw)) return "The deck didn't pass the course-material checks. Try a different focus or source.";
  if (/presenton|presentation service|renderer|502|503/i.test(raw)) return RENDER_MISSING;
  return "We couldn't finish that. Try again in a moment.";
}

function deckFileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `${slug || "study-deck"}.pptx`;
}

export default function StudioSurface({ courseId, lessonId, courseTitle, lessonTitle, onOpenSource, close, initialFocus = "", initialArtifactId, initialDeckId }: Props) {
  const [kind, setKind] = useState<StudioKind>("mind-map");
  const [focus, setFocus] = useState(initialFocus);
  const [practiceType, setPracticeType] = useState<PracticeType>("both");
  const [count, setCount] = useState(10);
  const [artifact, setArtifact] = useState<StudioArtifact | undefined>();
  const [history, setHistory] = useState<StudioArtifact[]>([]);
  const [filter, setFilter] = useState<StudioKind | "all">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [errorAction, setErrorAction] = useState<"generate" | "accept">("generate");

  // Everything made: one catalog of generated artifacts and slide decks.
  const [made, setMade] = useState<MadeItem[]>([]);
  const [madeLoading, setMadeLoading] = useState(true);
  const [madeError, setMadeError] = useState<Note | undefined>();
  const [madeFilter, setMadeFilter] = useState<MadeKind | "all">("all");

  // Slide deck creation and review, folded into the same surface.
  const [deckFocus, setDeckFocus] = useState("");
  const [deckBusy, setDeckBusy] = useState<"generating" | "opening" | "saving" | "deleting" | undefined>();
  const [deckNotice, setDeckNotice] = useState<Note | undefined>();
  const [selectedDeck, setSelectedDeck] = useState<SlideDeckArtifact | undefined>();
  const [deckRename, setDeckRename] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef);

  const refreshMade = useCallback(() => {
    setMadeLoading(true);
    void Promise.allSettled([
      listArtifacts(courseId, lessonId),
      listSlideDecks(courseId),
    ]).then((results) => {
      const studio = results[0].status === "fulfilled" ? results[0].value as StudioArtifact[] : [];
      const decks = results[1].status === "fulfilled" ? results[1].value as SlideDeckArtifact[] : [];
      setHistory(studio);
      setMade([
        ...studio.map((a) => ({ key: `studio-${a.id}`, id: a.id, kind: a.kind, title: a.title, createdAt: a.createdAt, source: "studio" as const, studio: a })),
        ...decks.map((d) => ({ key: `deck-${d.id}`, id: d.id, kind: "slide_deck" as const, title: d.title, createdAt: d.createdAt, source: "deck" as const })),
      ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
      if (results[0].status === "rejected" && results[1].status === "rejected") {
        setMadeError({ tone: "error", text: "Your library couldn't be loaded. Try again in a moment." });
      } else {
        setMadeError(undefined);
      }
      setMadeLoading(false);
    });
  }, [courseId, lessonId]);

  useEffect(() => { refreshMade(); }, [refreshMade]);

  const openDeck = useCallback((id: string) => {
    if (deckBusy) return;
    setDeckBusy("opening");
    void getSlideDeck(id, courseId)
      .then((item) => { setSelectedDeck(item); setDeckRename(item.title); setConfirmDelete(false); })
      .catch((reason: unknown) => setDeckNotice({ tone: "error", text: deckMessage(reason) }))
      .finally(() => setDeckBusy(undefined));
  }, [courseId, deckBusy]);

  useEffect(() => {
    if (madeLoading) return;
    if (initialArtifactId) {
      const found = made.find((item) => item.source === "studio" && item.id === initialArtifactId);
      if (found?.studio) { setArtifact(found.studio); setKind(found.studio.kind); }
    }
    if (initialDeckId && made.some((item) => item.source === "deck" && item.id === initialDeckId)) openDeck(initialDeckId);
    // Hand-off ids are applied once, after the first successful catalog load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [madeLoading]);

  const generate = async () => {
    setBusy(true); setError(""); setNotice(""); setErrorAction("generate");
    try {
      const created = await generateArtifact({ courseId, lessonId, kind, focus: focus.trim() || "Key concepts and mechanisms", practiceType, count });
      setArtifact(created);
      setFilter("all");
      if ("notice" in created && typeof created.notice === "string") setNotice(created.notice);
      setHistory((items) => [created, ...items].slice(0, 20));
      setMade((items) => [{ key: `studio-${created.id}`, id: created.id, kind: created.kind, title: created.title, createdAt: created.createdAt, source: "studio" as const, studio: created }, ...items]);
    } catch (reason) {
      setError(studentMessage(reason));
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

  const generateDeck = () => {
    if (deckBusy) return;
    setDeckBusy("generating");
    setDeckNotice({ tone: "info", text: "Building your deck from this lesson…" });
    void generateSlideDeck({ courseId, lessonId, focus: deckFocus.trim() || lessonTitle || "Key concepts and mechanisms" })
      .then((item) => {
        const degraded = !item.filePath;
        const reason = degraded && "notice" in item && typeof item.notice === "string" ? item.notice : RENDER_MISSING;
        setDeckNotice({ tone: degraded ? "info" : "success", text: degraded ? reason : "Deck ready. Open it below to review slides and speaker notes." });
        setSelectedDeck(item); setDeckRename(item.title); setConfirmDelete(false);
        return refreshMade();
      })
      .catch((reason: unknown) => setDeckNotice({ tone: "error", text: deckMessage(reason) }))
      .finally(() => setDeckBusy(undefined));
  };

  const saveDeck = () => {
    if (!selectedDeck || deckBusy || !deckRename.trim()) return;
    setDeckBusy("saving");
    void updateSlideDeck(selectedDeck.id, courseId, { title: deckRename.trim(), collection: selectedDeck.collection })
      .then((updated) => {
        setSelectedDeck(updated);
        setDeckNotice({ tone: "success", text: "Deck name saved." });
        return refreshMade();
      })
      .catch((reason: unknown) => setDeckNotice({ tone: "error", text: deckMessage(reason) }))
      .finally(() => setDeckBusy(undefined));
  };

  const removeDeck = () => {
    if (!selectedDeck || deckBusy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setDeckNotice({ tone: "info", text: "Delete this deck? Select Delete again to confirm." });
      return;
    }
    setDeckBusy("deleting");
    void deleteSlideDeck(selectedDeck.id, courseId)
      .then(() => {
        setSelectedDeck(undefined); setConfirmDelete(false);
        setDeckNotice({ tone: "success", text: "Deck deleted." });
        return refreshMade();
      })
      .catch((reason: unknown) => setDeckNotice({ tone: "error", text: deckMessage(reason) }))
      .finally(() => setDeckBusy(undefined));
  };

  const visibleMade = madeFilter === "all" ? made : made.filter((item) => item.kind === madeFilter);

  const openMade = (item: MadeItem) => {
    if (item.source === "studio" && item.studio) {
      setArtifact(item.studio); setKind(item.studio.kind);
    } else {
      openDeck(item.id);
    }
  };

  return (
    <div ref={dialogRef} tabIndex={-1} className="studio-surface" role="dialog" aria-modal="true" aria-label="StudyAI Studio" data-testid="studio-surface">
      <aside className="studio-sidebar">
        <div className="studio-brand"><span className="studio-mark"><Sparkles size={16} /></span> studyai <small>studio</small></div>
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
        <details>
          <summary>Advanced</summary>
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
                  {[5, 10, 15, 20].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </>
          )}
        </details>
        <button type="button" className="studio-primary studio-generate" data-testid="studio-generate" disabled={busy} aria-busy={busy} onClick={() => void generate()}>
          {busy ? <LoaderCircle size={15} strokeWidth={2} aria-hidden="true" /> : <Sparkles size={15} strokeWidth={1.8} aria-hidden="true" />}
          {busy ? "Generating…" : `Generate ${KIND_LABEL[kind]}`}
        </button>

        {history.length > 0 && (
          <>
            <div className="studio-group studio-group-row"><span>Artifacts</span><span className="studio-count">{visibleHistory.length}</span></div>
            <div className="studio-made-filters studio-filter" role="group" aria-label="Filter artifacts" data-testid="artifact-filter">
              <button type="button" data-testid="artifact-filter-all" aria-pressed={filter === "all"} className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>
              {TABS.map((tab) => (
                <button key={tab.id} type="button" data-testid={`artifact-filter-${tab.id}`} aria-pressed={filter === tab.id} className={filter === tab.id ? "active" : ""} onClick={() => setFilter(tab.id)}>{tab.label}</button>
              ))}
            </div>
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

        <div className="studio-group">Slide deck</div>
        <details>
          <summary>Advanced</summary>
          <label className="studio-field">Focus
            <input data-testid="deck-focus" value={deckFocus} onChange={(event) => setDeckFocus(event.target.value)} placeholder="Key concepts and mechanisms" maxLength={500} />
          </label>
        </details>
        <button type="button" className="studio-toolbar-button studio-deck-generate" data-testid="deck-generate" disabled={!!deckBusy} aria-busy={deckBusy === "generating"} onClick={generateDeck}>
          {deckBusy === "generating" ? "Building…" : "Build slide deck"}
        </button>

        <p className="studio-sidebar-note">Every item keeps a citation you can open.</p>
      </aside>

      <main className="studio-main">
        <SurfaceHeader
          eyebrow="Studio"
          title="StudyAI Studio"
          subtitle={`${lessonTitle} · ${courseTitle}`}
          backLabel="Back to workspace"
          onBack={close}
          onClose={close}
          closeLabel="Close Studio"
          backClassName="studio-back"
          closeClassName="studio-close"
        />
        <div className="studio-body" aria-busy={busy}>
          <section className="studio-made" aria-label="Everything made">
            <div className="studio-made-head">
              <h2>Everything made</h2>
              <div className="studio-made-filters" role="group" aria-label="Filter by type" data-testid="library-filter">
                {MADE_FILTERS.map((option) => (
                  <button key={option.id} type="button" data-testid={`library-filter-${option.id}`} aria-pressed={madeFilter === option.id}
                    className={madeFilter === option.id ? "active" : ""} onClick={() => setMadeFilter(option.id)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {madeLoading && (
              <div className="studio-made-loading" role="status" aria-live="polite" data-testid="library-status">
                <div className="studio-made-skeletons" aria-hidden="true">
                  <span className="studio-made-skeleton" /><span className="studio-made-skeleton" />
                </div>
                <span>Loading your library…</span>
              </div>
            )}
            {!madeLoading && madeError && (
              <div className="studio-made-error" data-testid="library-status" role="status">
                <CircleAlert size={17} strokeWidth={1.9} aria-hidden="true" />
                <span>Your library couldn't be loaded; your course material is unchanged.</span>
                <button type="button" data-testid="library-retry" onClick={() => refreshMade()}>Retry</button>
              </div>
            )}
            {!madeLoading && !madeError && visibleMade.length === 0 && (
              <p className="studio-made-empty" data-testid="library-empty">
                {made.length === 0 ? "No artifacts yet. Make one here to see it." : "No artifacts match that filter."}
              </p>
            )}

            <div className="studio-made-list">
              {visibleMade.map((item) => (
                <article className="artifact-row" data-testid="library-item" key={item.key}>
                  <div>
                    <b>{item.title}</b>
                    <small>{MADE_KIND_LABEL[item.kind]} · {new Date(item.createdAt).toLocaleDateString()}</small>
                  </div>
                  <button className="button-soft" data-testid="library-open" onClick={() => openMade(item)} disabled={madeLoading || !!deckBusy}>Open</button>
                </article>
              ))}
            </div>
          </section>

          {deckNotice && (
            <SurfaceNotice tone={deckNotice.tone} text={deckNotice.text} testId="artifacts-status" className="artifacts-status studio-deck-status" />
          )}

          {error && (
            <div className="studio-error" role="alert" data-testid="studio-error">
              <CircleAlert size={18} strokeWidth={1.9} aria-hidden="true" />
              <div>
                <strong>That didn't go through</strong>
                <p>{error}</p>
                <button type="button" className="studio-error-retry" data-testid="studio-error-retry" onClick={retry}>Try again</button>
              </div>
            </div>
          )}

          {!busy && notice && (
            <SurfaceNotice tone="info" text={notice} testId="studio-notice" className="studio-notice" />
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

          {!busy && !shown && !madeError && (
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
          {!busy && shown?.kind === "practice" && <PracticeView artifact={shown} onOpenSource={onOpenSource} />}

          {selectedDeck && (
            <section className="studio-deck" data-testid="deck-detail" aria-label="Slide deck">
              <div className="artifacts-detail-head">
                <div><h3>{selectedDeck.title}</h3><small>{selectedDeck.content.slides.length} slides · {selectedDeck.sourceRefs.length} cited sources</small></div>
                {selectedDeck.filePath ? (
                  <a className="button-soft" data-testid="artifact-download" href={downloadSlideDeckUrl(selectedDeck.id, selectedDeck.courseId)} download={deckFileName(selectedDeck.title)}>Download .pptx</a>
                ) : (
                  <button type="button" className="button-soft" data-testid="artifact-download-unavailable" aria-describedby="artifact-download-note" disabled>Download unavailable</button>
                )}
              </div>
              {!selectedDeck.filePath && <p id="artifact-download-note" className="artifacts-empty" data-testid="artifact-download-note">{RENDER_MISSING}</p>}
              <div className="artifacts-rename">
                <label htmlFor="artifact-title">Deck name</label>
                <input id="artifact-title" data-testid="artifact-rename" aria-label="Artifact title" value={deckRename} onChange={(event) => setDeckRename(event.target.value)} maxLength={200} />
                <button className="button-primary" data-testid="artifact-save" onClick={saveDeck} disabled={!!deckBusy || !deckRename.trim()}>Save</button>
                <button className="button-soft" data-testid="artifact-delete" onClick={removeDeck} disabled={!!deckBusy}>
                  {confirmDelete ? "Confirm delete" : "Delete"}
                </button>
              </div>
              <div className="slide-grid">
                {selectedDeck.content.slides.map((slide, index) => (
                  <article className="slide-card" data-testid="slide-card" key={`${selectedDeck.id}-${index}`}>
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
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
