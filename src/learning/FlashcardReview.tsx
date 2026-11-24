import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { API } from "../api";
import { useDialogFocus } from "../components/useDialogFocus";
import { makePractice } from "./make-practice";

type DueCard = { cardId: string; conceptId: string; concept: string; front: string; back: string; dueAt: string; sourceTitle?: string; sourcePage?: number | null; sourceExcerpt?: string };
type Rating = "Again" | "Hard" | "Good" | "Easy";

export default function FlashcardReview({ courseId, lessonId, lessonTitle, close }: { courseId: string; lessonId: string; lessonTitle: string; close: () => void }) {
  const [cards, setCards] = useState<DueCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState("");
  const [nextDue, setNextDue] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(true, dialogRef);

  const loadCards = async () => {
    try {
      const response = await fetch(`${API}/study/cards?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`);
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error || "Flashcards could not be loaded.");
      setCards(value as DueCard[]);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Flashcards could not be loaded.");
    }
  };

  useEffect(() => {
    let live = true;
    fetch(`${API}/study/cards?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`)
      .then(async (response) => {
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(value.error || "Flashcards could not be loaded.");
        return value as DueCard[];
      })
      .then((value) => { if (live) setCards(value); })
      .catch((reason) => { if (live) setStatus(reason instanceof Error ? reason.message : "Flashcards could not be loaded."); });
    return () => { live = false; };
  }, [courseId, lessonId]);

  const makeCards = async () => {
    setStatus("");
    try {
      await makePractice({ courseId, lessonId, focus: lessonTitle, practiceType: "cards" });
      await loadCards();
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Cards could not be generated.");
    }
  };

  const rate = async (rating: Rating) => {
    const card = cards[0];
    if (!card) return;
    setStatus("");
    try {
      const response = await fetch(`${API}/study/card-reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.cardId, rating, idempotencyKey: crypto.randomUUID() }),
      });
      const value = await response.json().catch(() => ({})) as { error?: string; dueAt?: string };
      if (!response.ok) throw new Error(value.error || "The review could not be saved.");
      setNextDue(new Date(value.dueAt!).toLocaleString());
      setCards((current) => current.slice(1));
      setRevealed(false);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "The review could not be saved.");
    }
  };

  const card = cards[0];

  return (
    <div className="modal-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialogRef} tabIndex={-1} className="settings-modal" role="dialog" aria-label="Flashcard review" aria-modal="true" data-testid="flashcard-review" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">SPACED REVIEW</span><h2>Flashcards</h2></div>
          <button className="icon-button" onClick={close} aria-label="Close flashcard review"><X size={18} /></button>
        </div>
        {status && <p role="status">{status}</p>}
        {nextDue && <p role="status">Next review {nextDue}</p>}
        {!card && !status && <p role="status">No flashcards are due</p>}
        {!card && !status && <button className="button-primary" onClick={() => void makeCards()}>Make cards from this lesson</button>}
        {card && (
          <>
            <p className="study-concept">{card.concept}</p>
            {(card.sourceTitle || card.sourceExcerpt) && <p className="study-citation">Source: {card.sourceTitle}{card.sourcePage ? `, p. ${card.sourcePage}` : ""}. {card.sourceExcerpt}</p>}
            <div className="stage-body">
              <button className="cv-flashcard" aria-label={revealed ? "Show question" : "Reveal card"} onClick={() => setRevealed(!revealed)}>
                <span className="cv-flashcard-label">{revealed ? "ANSWER" : "QUESTION"}</span>
                <strong>{revealed ? card.back : card.front}</strong>
                <span className="cv-flashcard-hint"><RotateCcw size={12} /> {revealed ? "back to question" : "click to flip"}</span>
              </button>
            </div>
            {revealed && <div className="study-ratings">{(["Again", "Hard", "Good", "Easy"] as const).map((rating) => <button key={rating} onClick={() => void rate(rating)}>{rating}</button>)}</div>}
          </>
        )}
      </section>
    </div>
  );
}
