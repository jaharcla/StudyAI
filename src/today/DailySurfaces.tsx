/**
 * Home and Today: the two entry screens. They only read the shared Coach stream
 * and the existing document service; activation stays in App's prepareCoachTarget.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown, CloudUpload, FileText, LoaderCircle, Sparkles, TriangleAlert, X } from "lucide-react";
import { Citation } from "../components/document-intelligence/Citation.js";
import { DOCUMENT_API, type DocumentData, type LibraryDocument, sourceDocumentUrl, requestJson, uploadOne } from "../components/document-intelligence/api.js";
import type { CoachPreparationResult, CoachPrompt, CoachTarget } from "../coach/contract.js";
import "./daily-surfaces.css";

export type Preparation = (target: CoachTarget) => Promise<CoachPreparationResult> | CoachPreparationResult;
type SummaryDocument = { id: string; title: string; filename: string; units: Array<{ type: string; number: number; text: string }> };
export type CourseSummaryPoint = { sourceRef: string; title: string; excerpt: string };

/** Verbatim excerpts only: no generated claim enters the first-run summary. */
export function courseSummary(documents: readonly SummaryDocument[]): CourseSummaryPoint[] {
  return documents
    .map((document) => {
      const unit = document.units.find((item) => item.text.trim().length > 0);
      if (!unit) return null;
      return {
        sourceRef: `studyai://document/${encodeURIComponent(document.id)}/${unit.type}/${unit.number}?chunk=0`,
        title: document.title || document.filename,
        excerpt: unit.text.trim().slice(0, 240),
      };
    })
    .filter((point): point is CourseSummaryPoint => point !== null)
    .slice(0, 3);
}

export function indexingText(indexed: readonly { chunkCount: number }[], active: number, done: number): string {
  if (active > 0) return `Indexing ${done} of ${active} sources…`;
  if (!indexed.length) return "No sources indexed yet";
  return `${indexed.length} sources indexed · ${indexed.reduce((sum, item) => sum + item.chunkCount, 0)} passages`;
}

const UNAVAILABLE = "That step is not available right now. Nothing was changed.";

function useActivation(onPrepare: Preparation, onStatus: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const activate = useCallback(async (prompt: CoachPrompt) => {
    if (busy) return;
    setBusy(true);
    onStatus("");
    try {
      const result = await onPrepare(prompt.target);
      onStatus(result.message || UNAVAILABLE);
    } catch {
      onStatus(UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }, [busy, onPrepare, onStatus]);
  return { busy, activate };
}

export function TodayStrip({ prompts, onPrepare, onStatus, onOpenToday }: {
  prompts: CoachPrompt[];
  onPrepare: Preparation;
  onStatus: (message: string) => void;
  onOpenToday: () => void;
}) {
  const top = prompts[0] ?? null;
  const { busy, activate } = useActivation(onPrepare, onStatus);
  return (
    <section className="daily-strip" data-testid="today-strip" role="region" aria-label="Today">
      <span className="daily-strip-mark"><CalendarDays size={16} aria-hidden="true" /></span>
      <div className="daily-strip-copy">
        {top ? (
          <>
            {top.plan && <small data-testid="today-plan-line">Plan {top.plan.day}, step {top.plan.step} of {top.plan.total}</small>}
            <p data-testid="today-reason">{top.reason}</p>
          </>
        ) : (
          <p data-testid="today-empty">No recommendation yet. Add a course source or answer a question to start today's plan.</p>
        )}
      </div>
      {top && <button type="button" className="daily-primary" data-testid="today-continue" disabled={busy} onClick={() => void activate(top)}>Continue <ArrowRight size={14} aria-hidden="true" /></button>}
      <button type="button" className="daily-quiet" data-testid="open-today-strip" onClick={onOpenToday}>Today</button>
    </section>
  );
}

export function TodaySurface({ prompts, courseTitle, lessonTitle, onPrepare, onStatus, onOpenSource, close }: {
  prompts: CoachPrompt[];
  courseTitle: string;
  lessonTitle: string;
  onPrepare: Preparation;
  onStatus: (message: string) => void;
  onOpenSource: (sourceRef: string) => void;
  close: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  const top = prompts[0] ?? null;
  const secondary = prompts.slice(1);
  const { busy, activate } = useActivation(onPrepare, onStatus);
  const [expanded, setExpanded] = useState(false);
  const groups = useMemo(() => {
    const result = new Map<string, CoachPrompt[]>();
    for (const prompt of prompts) {
      const day = prompt.plan?.day ?? "Today";
      result.set(day, [...(result.get(day) ?? []), prompt]);
    }
    return [...result.entries()];
  }, [prompts]);

  return (
    <div ref={dialogRef} tabIndex={-1} className="daily-surface" role="dialog" aria-modal="true" aria-label="Today" data-testid="today-surface">
      <header className="daily-surface-head">
        <div><span className="daily-eyebrow">RETURN VISIT · {top?.plan?.date ?? "TODAY"}</span><h2>Today</h2></div>
        <button type="button" className="daily-icon" aria-label="Close Today" onClick={close}><X size={18} /></button>
      </header>
      <p className="daily-resume" data-testid="today-resume">Resuming {courseTitle} · {lessonTitle}. Nothing was lost.</p>

      <section className="daily-plan" data-testid="today-plan" aria-label="Daily plan">
        {groups.length === 0 && <p data-testid="today-empty">Your plan is clear for today. Add a course source or answer a question to get a recommended step.</p>}
        {groups.map(([day, items]) => (
          <div className="daily-plan-day" key={day}>
            <span className="daily-eyebrow">{day}</span>
            {items.map((prompt) => (
              <article className="daily-plan-step" data-testid="today-plan-step" key={prompt.id}>
                {prompt.plan && <small>Plan {prompt.plan.date}, step {prompt.plan.step} of {prompt.plan.total}</small>}
                <strong>{prompt.title}</strong>
                <p>{prompt.reason}</p>
                <p className="daily-preview">{prompt.preview}</p>
                {prompt.source?.sourceRef && <Citation sourceRef={prompt.source.sourceRef} title={prompt.source.title} compact onOpen={onOpenSource} />}
              </article>
            ))}
          </div>
        ))}
      </section>

      {top && <div className="daily-surface-actions"><button type="button" className="daily-primary" data-testid="today-surface-continue" disabled={busy} onClick={() => void activate(top)}>Continue <ArrowRight size={15} aria-hidden="true" /></button><p className="daily-preview">{top.preview}</p></div>}

      {secondary.length > 0 && <div className="daily-secondary-wrap">
        <button type="button" className="daily-quiet" data-testid="today-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{secondary.length} more for today <ChevronDown size={14} aria-hidden="true" /></button>
        {expanded && <ul className="daily-secondary" data-testid="today-secondary">
          {secondary.map((prompt) => (
            <li data-testid="today-secondary-item" key={prompt.id}>
              <div><strong>{prompt.title}</strong><p>{prompt.reason}</p></div>
              <button type="button" className="daily-quiet" onClick={() => void activate(prompt)}>Open</button>
            </li>
          ))}
        </ul>}
      </div>}
    </div>
  );
}

type HomeJob = { id: string; name: string; status: "uploading" | "indexing" | "indexed" | "error"; progress: number; message: string };

export function HomeSurface({ courseId, lessonId, courseTitle, lessonTitle, prompts, onPrepare, onStatus, onOpenSource, onRefresh, onOpenLibrary, onGoToday, close }: {
  courseId: string;
  lessonId: string;
  courseTitle: string;
  lessonTitle: string;
  prompts: CoachPrompt[];
  onPrepare: Preparation;
  onStatus: (message: string) => void;
  onOpenSource: (sourceRef: string) => void;
  onRefresh: () => void;
  onOpenLibrary: () => void;
  onGoToday: () => void;
  close: () => void;
}) {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [summary, setSummary] = useState<CourseSummaryPoint[]>([]);
  const [jobs, setJobs] = useState<HomeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { busy, activate } = useActivation(onPrepare, onStatus);

  useEffect(() => {
    if (!courseId) return;
    let live = true;
    setLoading(true);
    requestJson<{ documents: LibraryDocument[] }>(`${DOCUMENT_API}/documents?course=${encodeURIComponent(courseId)}`)
      .then(async (body) => {
        const rows = body.documents ?? [];
        const details = await Promise.all(rows.slice(0, 3).map((row) => requestJson<DocumentData>(sourceDocumentUrl(row.id, courseId)).catch(() => null)));
        if (live) {
          setDocuments(rows);
          setSummary(courseSummary(details.filter((item): item is DocumentData => item !== null)));
        }
      })
      .catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : "Could not load your course sources."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [courseId, reloadKey]);

  const importFiles = async (files: File[]) => {
    if (!files.length || !courseId) return;
    const created: HomeJob[] = files.map((file) => {
      const message = !/\.(pdf|docx|pptx|txt)$/i.test(file.name) ? "Supported formats: PDF, DOCX, PPTX, TXT."
        : file.size > 20 * 1024 * 1024 ? "File exceeds 20 MB." : "";
      return { id: crypto.randomUUID(), name: file.name, status: message ? "error" as const : "uploading" as const, progress: 0, message };
    });
    setJobs((current) => [...created, ...current].slice(0, 8));
    setError(created.find((job) => job.message)?.message ?? "");
    for (const [index, job] of created.entries()) {
      if (job.status === "error") continue;
      const result = await uploadOne(files[index], courseId, (progress) => {
        setJobs((current) => current.map((item) => item.id === job.id ? { ...item, progress, status: progress >= 100 ? "indexing" : "uploading" } : item));
      }, lessonId);
      setJobs((current) => current.map((item) => item.id === job.id ? {
        ...item,
        status: result.status === "error" ? "error" : "indexed",
        message: result.message,
      } : item));
    }
    setReloadKey((key) => key + 1);
    onRefresh();
  };

  // The document service indexes into its own store; a freshly dropped source gets a
  // real, cited Studio target here so first run never depends on legacy learning signals.
  const firstPrompts = useMemo<CoachPrompt[]>(() => {
    if (prompts.length) return prompts;
    return summary.map((point) => ({
      id: `first-source:${point.sourceRef}`,
      kind: "recommendation",
      title: `Study guide from ${point.title}`,
      reason: `Your ${point.title} material is indexed. Turn it into a study guide.`,
      preview: "Opens StudyAI Studio with this source set as the focus.",
      source: { title: point.title, excerpt: point.excerpt, sourceRef: point.sourceRef },
      target: {
        courseId, lessonId, destination: "studio", conceptId: null,
        reason: `Study guide from ${point.title}`,
        focus: `${point.title}: ${point.excerpt}`,
      },
      urgency: 1,
      staleness: 0,
    }));
  }, [prompts, summary, courseId, lessonId]);

  const actions = useMemo(() => {
    const fromPlan = firstPrompts.slice(0, 3).map((prompt) => ({ id: prompt.id, title: prompt.title, reason: prompt.reason, run: () => void activate(prompt) }));
    const fallback = [
      { id: "fallback-sources", title: "Open your sources", reason: "Browse the material in this lesson.", run: onOpenLibrary },
      { id: "fallback-tutor", title: "Ask the Tutor", reason: "Ask a question grounded in your course material.", run: close },
      { id: "fallback-today", title: "See today's plan", reason: "Review the next step prepared for this lesson.", run: () => { close(); onGoToday(); } },
    ];
    return [...fromPlan, ...fallback].slice(0, 3);
  }, [firstPrompts, activate, close, onGoToday, onOpenLibrary]);

  const active = jobs.filter((job) => job.status === "uploading" || job.status === "indexing").length;
  const done = jobs.filter((job) => job.status === "indexed").length;
  const top = firstPrompts[0] ?? null;

  return (
    <div className="daily-surface home-surface" role="dialog" aria-modal="true" aria-label="Home" data-testid="home-surface">
      <header className="daily-surface-head">
        <div><span className="daily-eyebrow">FIRST 60 SECONDS</span><h2>Welcome to {courseTitle || "your course"}</h2></div>
        <button type="button" className="daily-icon" aria-label="Close Home" onClick={close}><X size={18} /></button>
      </header>
      <p className="daily-resume">{lessonTitle ? `Starting ${lessonTitle}.` : "Add a lesson to begin."} Everything you need is already connected.</p>

      <div className={"home-dropzone" + (dragging ? " home-dropzone-active" : "")} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); void importFiles(Array.from(event.dataTransfer.files)); }}>
        <input ref={inputRef} data-testid="home-file-input" className="home-file-input" type="file" accept=".pdf,.docx,.pptx,.txt" multiple onChange={(event) => { void importFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <CloudUpload size={22} aria-hidden="true" />
        <div><strong>Drop your course files here</strong><span>PDF, DOCX, PPTX or TXT · up to 20 files</span></div>
        <button type="button" className="daily-primary" onClick={() => inputRef.current?.click()}>Choose files</button>
      </div>

      <section className="home-indexing" data-testid="indexing-progress" aria-live="polite">
        <span>{indexingText(documents, active, done)}</span>
        {(active > 0 || done > 0) && <div className="home-progress"><i style={{ width: `${active ? (done / (active + done)) * 100 : 100}%` }} /></div>}
        {jobs.map((job) => (
          <div className="home-job" key={job.id}>
            <FileText size={14} aria-hidden="true" />
            <span>{job.name}</span>
            <small>{job.status === "uploading" ? `Uploading ${job.progress}%` : job.status === "indexing" ? "Indexing…" : job.message}</small>
            {job.status === "uploading" || job.status === "indexing" ? <LoaderCircle size={14} className="home-spin" aria-hidden="true" /> : null}
            {job.status === "error" && <button type="button" className="daily-quiet" onClick={() => inputRef.current?.click()}>Try again</button>}
          </div>
        ))}
      </section>

      {error && <div className="home-error" data-testid="home-error" role="alert"><TriangleAlert size={14} aria-hidden="true" />{error}<button type="button" className="daily-quiet" onClick={() => setError("")}>Dismiss</button></div>}

      <section className="home-summary" data-testid="grounded-summary">
        <div className="daily-section-head"><span>WHAT YOUR MATERIAL SAYS</span><small>Verbatim from your sources</small></div>
        {loading ? <p>Reading your course sources…</p>
          : summary.length ? summary.map((point) => (
            <article className="home-summary-point" key={point.sourceRef}>
              <p>{point.excerpt}</p>
              <span data-testid="summary-citation"><Citation sourceRef={point.sourceRef} title={point.title} compact onOpen={onOpenSource} /></span>
            </article>
          ))
            : <p data-testid="summary-empty">Add a source to build a summary drawn from your course material.</p>}
      </section>

      <section className="home-actions" data-testid="first-actions" aria-label="Suggested first actions">
        <div className="daily-section-head"><span>SUGGESTED FIRST ACTIONS</span><small>One recommended step</small></div>
        {actions.map((action, index) => (
          <button type="button" className="home-action" data-testid="first-action" key={action.id} onClick={action.run}>
            <span className="home-action-number">{index + 1}</span>
            <span><strong>{action.title}</strong><small>{action.reason}</small></span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        ))}
      </section>

      <footer className="home-footer">
        <button type="button" className="daily-primary" data-testid="home-continue" disabled={!top || busy} onClick={() => { if (top) void activate(top); }}>Continue <ArrowRight size={15} aria-hidden="true" /></button>
        <p className="daily-preview">{top ? top.preview : "Add a source to get a prepared first step."}</p>
      </footer>
      <Sparkles className="home-corner-mark" size={14} aria-hidden="true" />
    </div>
  );
}
