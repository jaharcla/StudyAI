import { useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle, Quote, RotateCcw } from "lucide-react";
import { API } from "../api";
import { sourceLabel, type PracticeContent, type StudioArtifact } from "../studio/api";
import "./practice-test.css";

type AnswerResult = {
  correct: boolean;
  correctChoiceId: string;
  correctAnswerText: string;
  explanation: string;
  source: { title: string; page: number | null; excerpt: string; sourceRef: string };
};

type Props = {
  artifact: StudioArtifact;
  courseId: string;
  lessonId: string;
  onOpenSource: (sourceRef: string) => void;
};

/** Takes a grounded practice artifact as a test, then reveals its answer key and citations. */
export default function PracticeTestView({ artifact, courseId, lessonId, onOpenSource }: Props) {
  const questions = (artifact.content as PracticeContent).questions ?? [];
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, AnswerResult>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const runKey = useRef(crypto.randomUUID());
  const answered = questions.filter((_, index) => Boolean(answers[index])).length;
  const checked = Object.keys(results).length > 0;
  const correct = Object.values(results).filter((result) => result.correct).length;

  const startOver = () => {
    setAnswers({});
    setResults({});
    setError("");
    runKey.current = crypto.randomUUID();
  };

  const check = async () => {
    if (busy || !answered) return;
    setBusy(true);
    setError("");
    const next: Record<number, AnswerResult> = {};
    try {
      for (const [index, question] of questions.entries()) {
        const choiceId = answers[index];
        if (!choiceId) continue;
        const response = await fetch(`${API}/study/practice-answer`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ courseId, lessonId, artifactId: artifact.id, questionIndex: index, choiceId, idempotencyKey: `${runKey.current}:${index}` }),
        });
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(response.status >= 500
          ? `service unavailable (${response.status})`
          : typeof value.error === "string" ? value.error : "The answer could not be saved.");
        next[index] = value as AnswerResult;
        setResults({ ...next });
      }
    } catch (reason) {
      const raw = reason instanceof Error ? reason.message : "";
      setError(/429|5\d\d|service unavailable|rate limit|fetch failed|network|isn't responding/i.test(raw)
        ? "The study assistant isn't responding right now. Your course material is unchanged. Try again."
        : "We couldn't check your answers. Your course material is unchanged. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="practice-test" data-testid="practice-test">
      <div className="practice-test-bar">
        <span data-testid="practice-test-progress">{answered} of {questions.length} answered</span>
        {checked && <span className="practice-test-score" data-testid="practice-score">{correct} of {questions.length} correct · misses scheduled for review</span>}
      </div>

      {busy && <p className="practice-test-status" role="status" data-testid="practice-checking"><LoaderCircle size={14} aria-hidden="true" /> Checking your answers…</p>}
      {error && <div className="practice-test-error" role="alert" data-testid="practice-test-error">
        <p>{error}</p>
        <button type="button" className="button-soft" data-testid="practice-retry" onClick={() => void check()}>Try again</button>
      </div>}

      {!questions.length && (
        <p className="practice-test-empty" data-testid="practice-test-empty">
          This practice set has no questions. Generate a new one from this lesson’s course material.
        </p>
      )}

      {questions.map((question, index) => {
        const result = results[index];
        return (
          <section className={`practice-test-question${result ? (result.correct ? " correct" : " incorrect") : ""}`} data-testid="practice-question" key={index}>
            <h4><span className="practice-test-number">{index + 1}</span> {question.prompt}</h4>
            <p className="practice-test-concept">{question.concept}</p>
            <div className="practice-test-choices">
              {question.choices.map((choice) => {
                const selected = answers[index] === choice.id;
                const isAnswer = result?.correctChoiceId === choice.id;
                return (
                  <button
                    type="button"
                    key={choice.id}
                    className={`practice-test-choice${selected ? " selected" : ""}${isAnswer ? " answer" : ""}`}
                    data-testid="practice-choice"
                    data-question={index}
                    aria-pressed={selected}
                    disabled={busy || checked}
                    onClick={() => setAnswers((current) => ({ ...current, [index]: choice.id }))}
                  >{choice.text}</button>
                );
              })}
            </div>
            {result && (
              <div className="practice-test-key" data-testid="practice-answer-key">
                <p className="practice-test-verdict" data-testid="practice-result">
                  {result.correct ? <Check size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
                  {result.correct ? "Correct" : "Not quite"}
                </p>
                <p><b>Answer:</b> {result.correctAnswerText}</p>
                <p>{result.explanation}</p>
              </div>
            )}
            {question.sourceRef && (
              <button type="button" className="practice-test-cite" data-testid="practice-citation" onClick={() => onOpenSource(question.sourceRef)}>
                <Quote size={11} aria-hidden="true" /> {sourceLabel(question.sourceRef, result?.source.title)}
              </button>
            )}
          </section>
        );
      })}

      {questions.length > 0 && !checked && (
        <div className="practice-test-actions">
          <button type="button" className="button-primary" data-testid="check-practice-test" disabled={busy || answered < questions.length} onClick={() => void check()}>
            <Check size={14} aria-hidden="true" /> Check answers
          </button>
        </div>
      )}
      {checked && (
        <div className="practice-test-actions">
          <button type="button" className="button-soft" data-testid="practice-test-again" onClick={startOver}><RotateCcw size={14} aria-hidden="true" /> Try again</button>
        </div>
      )}
    </div>
  );
}
