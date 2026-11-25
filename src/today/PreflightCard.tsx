/**
 * One grounded warm-up before the next class. Every passage and the question
 * come from existing student material; nothing here is generated or guessed.
 */
import { useCallback, useEffect, useState } from "react";
import { Citation } from "../components/document-intelligence/Citation.js";
import { loadPreflight, type PreflightResult } from "./preflight.js";

export function PreflightCard({ courseId, lessonId, onStart, onOpenSource }: {
  courseId: string;
  lessonId: string;
  onStart: () => void;
  onOpenSource: (sourceRef: string) => void;
}) {
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let live = true;
    setResult(null);
    void loadPreflight(courseId, lessonId).then((value) => { if (live) setResult(value); });
    return () => { live = false; };
  }, [courseId, lessonId, attempt]);

  return (
    <section className="preflight-card" data-testid="preflight-card" aria-label="Pre-flight">
      <span className="daily-eyebrow">NEXT LESSON · PRE-FLIGHT</span>
      <h3>Warm up from your material</h3>
      {!result && <p className="preflight-note" data-testid="preflight-loading">Preparing your warm-up from course material…</p>}
      {result?.status === "error" && <div className="preflight-note" data-testid="preflight-error" role="alert">
        <p>{result.message}</p>
        <button type="button" className="daily-quiet" data-testid="preflight-retry" onClick={retry}>Try again</button>
      </div>}
      {result?.status === "empty" && <p className="preflight-note" data-testid="preflight-empty">
        {result.reason === "no-concepts"
          ? "No weak concepts are ready yet. Answer a question to build your concept graph."
          : "No cited passages are indexed for these concepts yet. Add a course source to warm up from."}
      </p>}
      {result?.status === "ready" && <>
        <div className="preflight-items">
          {result.concepts.map((item) => (
            <article className="preflight-item" data-testid="preflight-item" key={`${item.sourceRef}:${item.label}`}>
              <small>{item.label} · weak prerequisite</small>
              <p data-testid="preflight-excerpt">{item.excerpt}</p>
              <span data-testid="preflight-citation"><Citation sourceRef={item.sourceRef} compact onOpen={onOpenSource} /></span>
            </article>
          ))}
        </div>
        {result.question ? <div className="preflight-question-box">
          <span className="daily-eyebrow">REVIEWED QUESTION</span>
          <p data-testid="preflight-question">{result.question.prompt}</p>
          <button type="button" className="daily-primary" data-testid="preflight-start" onClick={onStart}>Start question</button>
        </div> : <p className="preflight-note" data-testid="preflight-no-question">
          No reviewed question for this lesson yet. Create a question from course text in Study.
        </p>}
      </>}
    </section>
  );
}
