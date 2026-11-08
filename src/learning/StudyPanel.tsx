import { useEffect, useState } from "react";
import { Brain, CheckCircle2, CircleAlert, RotateCcw, X } from "lucide-react";
import "./study.css";
import { API } from "../api";

type Question = { presentationId: string; questionId: string; version: number; conceptId: string; concept: string; prompt: string; choices: Array<{ id: string; text: string }>; source: { documentId: string; title: string; page: number | null; excerpt: string } };
type Result = { correct: boolean; explanation: string; mastery: number; source: Question["source"] };
type Resume = { phase: "answer"; question: Question } | { phase: "rate"; result: Record<string, unknown> } | { phase: "ready"; dueCard: Record<string, unknown> | null };
function readyMessage(card: Record<string, unknown> | null) {
  if (!card) return "No answer is waiting for a rating. Ask a reviewed question to begin.";
  try { const dueAt = JSON.parse(String(card.fsrs_state)).due; return `Next review due ${new Date(dueAt).toLocaleString()}.`; }
  catch { return "No answer is waiting for a rating. Ask a reviewed question to begin."; }
}

export function StudyPanel({ courseId, lessonId, close }: { courseId: string; lessonId: string; close: () => void }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [cardId, setCardId] = useState("");
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("Loading your saved study state…");
  const [busy, setBusy] = useState(false);
  const scope = `course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`;

  async function resume() {
    const response = await fetch(`${API}/study/resume?${scope}`);
    const state = await response.json() as Resume & { error?: string };
    if (!response.ok) throw new Error(state.error ?? "Study state could not be loaded.");
    if (state.phase === "answer") { setQuestion(state.question); setResult(null); setStatus(""); }
    else if (state.phase === "rate") {
      const value = state.result;
      setResult({ correct: Boolean(value.is_correct), explanation: String(value.explanation), mastery: Number(value.mastery ?? 0), source: { documentId: String(value.source_document_id), title: String(value.source_title), page: value.source_page as number | null, excerpt: String(value.source_excerpt) } });
      setCardId(String(value.card_id)); setQuestion(null); setStatus("");
    } else { setQuestion(null); setResult(null); setStatus(readyMessage(state.dueCard)); }
  }
  useEffect(() => { let live = true; fetch(`${API}/study/resume?${scope}`).then(async (response) => { const value = await response.json(); if (!response.ok) throw new Error(value.error); return value as Resume; }).then((state) => { if (live) { if (state.phase === "answer") { setQuestion(state.question); setStatus(""); } else if (state.phase === "rate") { const value = state.result; setResult({ correct: Boolean(value.is_correct), explanation: String(value.explanation), mastery: Number(value.mastery ?? 0), source: { documentId: String(value.source_document_id), title: String(value.source_title), page: value.source_page as number | null, excerpt: String(value.source_excerpt) } }); setCardId(String(value.card_id)); setStatus(""); } else setStatus(readyMessage(state.dueCard)); } }).catch((error) => { if (live) setStatus(error instanceof Error ? error.message : "Study state could not be loaded."); }); return () => { live = false; }; }, [courseId, lessonId]);

  async function ask() {
    setBusy(true); setSelected(""); setResult(null);
    try { const response = await fetch(`${API}/study/ask?${scope}`); const value = await response.json(); if (!response.ok) throw new Error(value.error); setQuestion(value as Question); setStatus(""); }
    catch (error) { setStatus(error instanceof Error ? error.message : "A question could not be loaded."); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!question || !selected) return;
    setBusy(true);
    try { const response = await fetch(`${API}/study/attempts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentationId: question.presentationId, idempotencyKey: crypto.randomUUID(), choiceId: selected }) }); const value = await response.json(); if (!response.ok) throw new Error(value.error); await resume(); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Your answer could not be saved."); }
    finally { setBusy(false); }
  }
  async function rate(rating: "Again" | "Hard" | "Good" | "Easy") {
    setBusy(true);
    try { const response = await fetch(`${API}/study/reviews`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId, idempotencyKey: crypto.randomUUID(), rating }) }); const value = await response.json(); if (!response.ok) throw new Error(value.error); setResult(null); setCardId(""); setStatus(`Review scheduled for ${new Date(value.dueAt).toLocaleString()}.`); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Review could not be saved."); }
    finally { setBusy(false); }
  }

  return <div className="study-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="study-panel" role="dialog" aria-modal="true" aria-labelledby="study-title"><header><span><Brain size={17} /> ADAPTIVE STUDY</span><button className="icon-button" onClick={close} aria-label="Close study"><X size={17} /></button></header><h2 id="study-title">{question?.prompt ?? (result ? "Review your answer" : "Study this lesson")}</h2>{question && <><p className="study-concept">{question.concept}</p><div className="study-choices">{question.choices.map((choice) => <button key={choice.id} className={selected === choice.id ? "selected" : ""} onClick={() => setSelected(choice.id)} disabled={busy}>{choice.text}</button>)}</div><p className="study-citation">Source: {question.source.title}{question.source.page ? `, p. ${question.source.page}` : ""}. {question.source.excerpt}</p><button className="button-primary" onClick={submit} disabled={!selected || busy}>Check answer</button></>}{result && <><p className={`study-result ${result.correct ? "correct" : "incorrect"}`}>{result.correct ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}{result.correct ? "Correct" : "Not quite"}</p><p>{result.explanation}</p><p className="study-mastery">Concept mastery: {Math.round(result.mastery * 100)}%</p><p className="study-citation">Source: {result.source.title}{result.source.page ? `, p. ${result.source.page}` : ""}. {result.source.excerpt}</p><div className="study-ratings">{(["Again", "Hard", "Good", "Easy"] as const).map((rating) => <button key={rating} onClick={() => rate(rating)} disabled={busy}>{rating}</button>)}</div></>}{status && <p className="study-status">{status}</p>}{!question && !result && <div className="study-actions"><button className="button-primary" onClick={ask} disabled={busy}><RotateCcw size={14} /> Ask a reviewed question</button></div>}</section></div>;
}
