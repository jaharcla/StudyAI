import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAgentContext } from "@copilotkit/react-core/v2";
import { API } from "../api";
import type { ActivityAttempt } from "./activities/contracts";
import type { ActivitySession } from "./ActivityLibrary";

type CanvasState = { id: string; revision: number; saved: boolean };
type Props = { courseId: string; lessonId: string; session: ActivitySession; canvas: CanvasState | null; onClose: () => void };

export function ActivityTaskPanel({ courseId, lessonId, session, canvas, onClose }: Props) {
  const [attempt, setAttempt] = useState<ActivityAttempt>(session.attempt);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ taskId: string; status: string; summary: string } | null>(session.latestResult && session.attempt.responses.length ? { taskId: session.attempt.responses.at(-1)!.taskId, ...session.latestResult } : null);
  const [revealedHint, setRevealedHint] = useState("");
  const task = attempt.currentTaskId ? session.spec.tasks[attempt.currentTaskIndex] : null;
  const canvasMatches = canvas?.id === attempt.canvasId;
  const currentRevision = canvasMatches ? canvas.revision : attempt.canvasRevision;
  const currentHintIndex = task ? attempt.hintsUsed.filter((item) => item.taskId === task.id).length : 0;

  useAgentContext({ description: "StudyAI active learning activity", value: { attemptId: attempt.id } });

  useEffect(() => {
    setAttempt(session.attempt); setAnswer(""); setError(""); setRevealedHint("");
    setResult(session.latestResult && session.attempt.responses.length ? { taskId: session.attempt.responses.at(-1)!.taskId, ...session.latestResult } : null);
  }, [session.attempt.id, session.attempt.updatedAt]);

  const submit = async () => {
    if (!task || !canvasMatches || !canvas?.saved) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/activities/attempts/${encodeURIComponent(attempt.id)}/submit`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, lessonId, taskId: task.id, canvasRevision: currentRevision, idempotencyKey: crypto.randomUUID(), response: answer.trim() }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Answer could not be checked.");
      setAttempt(value.attempt); setResult({ taskId: task.id, status: value.result.status, summary: value.result.summary }); setAnswer(""); setRevealedHint("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Answer could not be checked."); }
    finally { setBusy(false); }
  };

  const showHint = async () => {
    if (!task || currentHintIndex >= task.hints.length) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/activities/attempts/${encodeURIComponent(attempt.id)}/hints`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, lessonId, taskId: task.id, hintIndex: currentHintIndex, idempotencyKey: crypto.randomUUID() }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Hint could not be loaded.");
      setAttempt(value.attempt); setRevealedHint(value.hint);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Hint could not be loaded."); }
    finally { setBusy(false); }
  };

  return <aside className="activity-task-panel" aria-label="Activity task">
    <header><div><span className="eyebrow">{session.spec.title}</span><small>{attempt.status === "completed" ? "Completed" : `Task ${attempt.currentTaskIndex + 1} of ${session.spec.tasks.length}`}</small></div><button className="icon-button" aria-label="Close activity" onClick={onClose}><X size={16} /></button></header>
    {task ? <>
      <h3>{task.prompt}</h3>
      <p className="activity-task-source">Grounded in this lesson’s indexed course material.</p>
      {canvasMatches && !canvas.saved && <p className="activity-task-status" role="status">Saving canvas changes…</p>}
      {!canvasMatches && <p className="activity-task-status" role="status">Loading the activity board…</p>}
      <label className="activity-answer">Your answer<input aria-label="Activity answer" inputMode="decimal" value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} placeholder="Enter a value" /></label>
      <div className="activity-task-actions"><button className="button-soft" disabled={busy || currentHintIndex >= task.hints.length} onClick={() => void showHint()}>{busy ? "Working…" : currentHintIndex >= task.hints.length ? "No more hints" : "Show next hint"}</button><button className="button-primary" disabled={busy || !answer.trim() || !canvasMatches || !canvas.saved} onClick={() => void submit()}>{busy ? "Checking…" : "Check answer"}</button></div>
      {revealedHint && <p className="activity-hint">{revealedHint}</p>}
      {result && <p className={`activity-result ${result.status}`} role="status"><b>{result.status}</b><span>{result.summary}</span></p>}
    </> : <div className="activity-completed"><b>All tasks complete</b><p>Your checker results and supported learning evidence are saved to this attempt.</p>{result && <p className={`activity-result ${result.status}`} role="status"><b>{result.status}</b><span>{result.summary}</span></p>}<button className="button-soft" onClick={onClose}>Return to canvas</button></div>}
    {error && <p className="activity-error" role="alert">{error}</p>}
  </aside>;
}
