import { useRef, useState } from "react";
import { Check, CircleAlert, Quote, RotateCcw } from "lucide-react";
import { API } from "../api";
import { sourceLabel, type PracticeContent, type StudioArtifact } from "../studio/api";
import { gradePracticeAnswer, type PracticeAnswerResult } from "./grade-practice";
import "./practice-test.css";

type Props = {
  artifact: StudioArtifact;
  courseId: string;
  lessonId: string;
  onOpenSource: (sourceRef: string) => void;
};

type Sync = "idle" | "saving" | "saved" | "paused";

/** Grades locally against the artifact's stored key; mastery recording is best-effort and never gates the verdict. */
export default function PracticeTestView({ artifact, courseId, lessonId, onOpenSource }: Props) {
  const content = artifact.content as PracticeContent;
  const questions = content.questions ?? [];
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, PracticeAnswerResult>>({});
  const [sync, setSync] = useState<Sync>("idle");
  const runKey = useRef(crypto.randomUUID());
  const answered = questions.filter((_, index) => Boolean(answers[index])).length;
  const checked = Object.keys(results).length > 0;
  const correct = Object.values(results).filter((result) => result.correct).length;

  const startOver = () => {
    setAnswers({});
    setResults({});
    setSync("idle");
    runKey.current = crypto.randomUUID();
  };

  const recordProgress = () => {
    setSync("saving");
    const posts = questions.map(async (question, index) => {
      const choiceId = answers[index];
      if (!choiceId) return;
      const response = await fetch(`${API}/study/practice-answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, lessonId, artifactId: artifact.id, questionIndex: index, choiceId, idempotencyKey: `${runKey.current}:${index}` }),
      });
      if (!response.ok) throw new Error("Progress could not be saved.");
    });
    void Promise.allSettled(posts).then((outcomes) => {
      setSync(outcomes.every((outcome) => outcome.status === "fulfilled") ? "saved" : "paused");
    });
  };

  const check = () => {
    if (!answered) return;
    const next: Record<number, PracticeAnswerResult> = {};
    for (const [index, question] of questions.entries()) {
      const choiceId = answers[index];
      if (choiceId) next[index] = gradePracticeAnswer(question, choiceId);
    }
    setResults(next);
    recordProgress();
  };

  const syncMessage = sync === "saving" ? "Saving progress…"
    : sync === "saved" ? "Progress saved"
      : sync === "paused" ? "Progress sync paused — your result is shown from this lesson's answer key."
        : "";

  return (
    <div className="practice-test" data-testid="practice-test">
      <div className="practice-test-bar">
        <span data-testid="practice-test-progress">{answered} of {questions.length} answered</span>
        <span className="practice-test-sync" data-testid="practice-sync" aria-live="polite">{syncMessage}</span>
        {checked && <span className="practice-test-score" data-testid="practice-score">{correct} of {questions.length} correct · graded from this lesson's answer key</span>}
      </div>

      {content.note && <p className="practice-test-note" data-testid="practice-test-note">{content.note}</p>}

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
                    disabled={checked}
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
          <button type="button" className="button-primary" data-testid="check-practice-test" disabled={answered < questions.length} onClick={check}>
            <Check size={14} aria-hidden="true" /> Check answers
          </button>
        </div>
      )}
      {checked && (
        <div className="practice-test-actions">
          {sync === "paused" && <button type="button" className="button-soft" data-testid="practice-sync-retry" onClick={recordProgress}>Retry progress sync</button>}
          <button type="button" className="button-soft" data-testid="practice-test-again" onClick={startOver}><RotateCcw size={14} aria-hidden="true" /> Try again</button>
        </div>
      )}
    </div>
  );
}
