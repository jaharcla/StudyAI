import { useState } from "react";
import { Check, Quote } from "lucide-react";
import { importPractice, sourceLabel, type PracticeContent } from "./api";

export default function PracticeView({ artifactId, content, onOpenSource }: {
  artifactId: string; content: PracticeContent; onOpenSource: (ref: string) => void;
}) {
  const [cards, setCards] = useState<Set<number>>(new Set(content.cards.map((_, index) => index)));
  const [questions, setQuestions] = useState<Set<number>>(new Set(content.questions.map((_, index) => index)));
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (set: Set<number>, setter: (next: Set<number>) => void, index: number) => {
    const next = new Set(set);
    if (next.has(index)) next.delete(index); else next.add(index);
    setter(next);
  };

  const send = async () => {
    setBusy(true); setStatus("");
    try {
      const result = await importPractice(artifactId, [...cards], [...questions]);
      const parts = [`${result.cardsAdded} cards and ${result.questionsAdded} questions added to your review deck.`];
      if (result.errors.length) parts.push(result.errors.join(" "));
      setStatus(parts.join(" "));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="studio-practice" data-testid="practice-view">
      <div className="studio-practice-bar">
        <span>{cards.size} cards · {questions.size} questions selected</span>
        <button type="button" className="studio-primary" data-testid="import-practice" disabled={busy || (!cards.size && !questions.size)} onClick={() => void send()}>
          <Check size={13} /> Add to study deck
        </button>
      </div>
      {status && <p className="studio-status" role="status">{status}</p>}
      {!content.cards.length && !content.questions.length && <p className="studio-muted">No practice items were generated.</p>}

      {content.cards.length > 0 && (
        <section>
          <h4>Flashcards</h4>
          <div className="studio-practice-grid">
            {content.cards.map((card, index) => (
              <label key={index} className={`studio-practice-card ${cards.has(index) ? "selected" : ""}`}>
                <input type="checkbox" checked={cards.has(index)} onChange={() => toggle(cards, setCards, index)} />
                <strong>{card.front}</strong>
                <span>{card.back}</span>
                <small>{card.concept}</small>
                <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenSource(card.sourceRef); }}><Quote size={11} /> {sourceLabel(card.sourceRef)}</button>
              </label>
            ))}
          </div>
        </section>
      )}

      {content.questions.length > 0 && (
        <section>
          <h4>Quiz questions</h4>
          <div className="studio-practice-grid">
            {content.questions.map((question, index) => (
              <label key={index} className={`studio-practice-card ${questions.has(index) ? "selected" : ""}`}>
                <input type="checkbox" checked={questions.has(index)} onChange={() => toggle(questions, setQuestions, index)} />
                <strong>{question.prompt}</strong>
                <span>{question.choices.find((choice) => choice.id === question.correctChoice)?.text}</span>
                <small>{question.concept}</small>
                <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenSource(question.sourceRef); }}><Quote size={11} /> {sourceLabel(question.sourceRef)}</button>
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
