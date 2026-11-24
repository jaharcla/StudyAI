import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogFocus } from "../components/useDialogFocus";
import { Layers, Library as LibraryIcon, Sparkles } from "lucide-react";
import { listArtifacts, type StudioArtifact, type StudioKind } from "../studio/api";
import { listSlideDecks, type SlideDeckArtifact } from "../artifacts/api";
import "./../artifacts/artifacts.css";
import { SurfaceHeader, SurfaceNotice } from "../components/SurfaceChrome";

type Props = {
  courseId: string;
  lessonId: string;
  courseTitle: string;
  lessonTitle: string;
  close: () => void;
  onOpenSource: (sourceRef: string) => void;
  onOpenStudio: (artifactId?: string) => void;
  onOpenArtifacts: (deckId?: string) => void;
};

type LibraryKind = StudioKind | "slide_deck" | "all";
type LibraryItem = {
  id: string;
  kind: LibraryKind extends "all" ? never : LibraryKind;
  title: string;
  createdAt: string;
  source: "studio" | "deck";
  studio?: StudioArtifact;
  deck?: SlideDeckArtifact;
};

const KIND_LABEL: Record<Exclude<LibraryKind, "all">, string> = {
  "mind-map": "Mind map",
  "study-guide": "Study guide",
  infographic: "Infographic",
  practice: "Practice",
  slide_deck: "Slide deck",
};

const FILTER_OPTIONS: Array<{ id: LibraryKind; label: string }> = [
  { id: "all", label: "All" },
  { id: "mind-map", label: "Mind maps" },
  { id: "study-guide", label: "Study guides" },
  { id: "infographic", label: "Infographics" },
  { id: "practice", label: "Practice" },
  { id: "slide_deck", label: "Slide decks" },
];

type Notice = { tone: "info" | "error" | "success"; text: string };
type Busy = "loading" | undefined;

export default function LibrarySurface({ courseId, lessonId, courseTitle, lessonTitle, close, onOpenSource, onOpenStudio, onOpenArtifacts }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [filter, setFilter] = useState<LibraryKind>("all");
  const [notice, setNotice] = useState<Notice | undefined>();
  const [busy, setBusy] = useState<Busy>("loading");
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, dialogRef);

  const refresh = useCallback(() => {
    setBusy("loading");
    void Promise.allSettled([
      listArtifacts(courseId, lessonId),
      listSlideDecks(courseId),
    ]).then((results) => {
      const studioItems: LibraryItem[] = results[0].status === "fulfilled"
        ? (results[0].value as StudioArtifact[]).map((a) => ({ id: a.id, kind: a.kind as Exclude<LibraryKind, "all">, title: a.title, createdAt: a.createdAt, source: "studio" as const, studio: a }))
        : [];
      const deckItems: LibraryItem[] = results[1].status === "fulfilled"
        ? (results[1].value as SlideDeckArtifact[]).map((d) => ({ id: d.id, kind: "slide_deck" as const, title: d.title, createdAt: d.createdAt, source: "deck" as const, deck: d }))
        : [];
      const combined = [...studioItems, ...deckItems].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setItems(combined);
      if (results[0].status === "rejected" && results[1].status === "rejected") {
        setNotice({ tone: "error", text: "Your library couldn't be loaded. Try again in a moment." });
      } else {
        setNotice(undefined);
      }
      setBusy(undefined);
    });
  }, [courseId, lessonId]);

  useEffect(() => { refresh(); }, [refresh]);

  const visible = filter === "all" ? items : items.filter((item) => item.kind === filter);

  const open = (item: LibraryItem) => {
    if (item.source === "studio") onOpenStudio(item.id);
    else onOpenArtifacts(item.id);
  };

  const kindLabel = (kind: Exclude<LibraryKind, "all">) => KIND_LABEL[kind] ?? kind;

  return (
    <div className="artifacts-surface" data-testid="library-surface">
      <div ref={dialogRef} tabIndex={-1} className="artifacts-shell" data-testid="library-page" role="dialog" aria-modal="true" aria-label="Library">
        <SurfaceHeader
          eyebrow="Library"
          title="Library"
          subtitle={`Everything made from ${lessonTitle || courseTitle} material.`}
          backLabel="Back to workspace"
          onBack={close}
          onClose={close}
          closeLabel="Close library"
          className="artifacts-head"
        >
          <button type="button" className="surface-link" data-testid="library-open-studio" onClick={() => onOpenStudio()}>
            <Sparkles size={15} strokeWidth={1.9} aria-hidden="true" /> Studio
          </button>
          <button type="button" className="surface-link" data-testid="library-open-artifacts" onClick={() => onOpenArtifacts()}>
            <Layers size={15} strokeWidth={1.9} aria-hidden="true" /> Artifacts
          </button>
        </SurfaceHeader>

        <section className="artifacts-create" aria-label="Library filters">
          <label htmlFor="library-filter">Filter by type</label>
          <select
            id="library-filter"
            data-testid="library-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as LibraryKind)}
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </section>

        <SurfaceNotice
          tone={notice?.tone ?? "info"}
          text={busy === "loading" ? "Loading your library…" : notice?.text ?? ""}
          testId="library-status"
          className={`artifacts-status artifacts-status-${notice?.tone ?? "info"}`}
        />

        <div className="artifacts-layout">
          <section className="artifacts-list" aria-label="Saved artifacts">
            {busy !== "loading" && visible.length === 0 && (
              <p className="artifacts-empty" data-testid="library-empty">
                {items.length === 0
                  ? "No artifacts yet. Make one in Studio or Artifacts to see it here."
                  : "No artifacts match that filter."}
              </p>
            )}
            {visible.map((item) => (
              <article className="artifact-row" data-testid="library-item" key={`${item.source}-${item.id}`}>
                <div>
                  <b>{item.title}</b>
                  <small>{kindLabel(item.kind as Exclude<LibraryKind, "all">)} · {new Date(item.createdAt).toLocaleDateString()}</small>
                </div>
                <button className="button-soft" data-testid="library-open" onClick={() => open(item)} disabled={!!busy}>
                  Open
                </button>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
