import { useState } from "react";
import {
  ArrowLeft, ArrowUp, BookOpen, Check, ChevronDown, ChevronRight, FileText,
  MoreHorizontal, Plus, Quote, RotateCcw, Search, Sparkles, SquarePen, X,
} from "lucide-react";
import { course, lesson, objects, suggestions } from "./data";

type Mode = "session" | "quiz" | "flashcards";

const quizQuestions = [
  {
    question: "A block rests on an incline. Which statement about equilibrium is correct?",
    options: [
      "The forces acting on the block are all equal in magnitude",
      "The vector sum of all forces acting on the block is zero",
      "The block must be moving at constant speed",
      "The normal force is larger than the weight",
    ],
    answer: 1,
    why: "At rest, ΣF⃗ = 0. Forces need not be equal; they must cancel as vectors.",
  },
  {
    question: "F₁ = (4.2, −1.8) N and F₂ = (−2.0, 1.8) N. What is F₁ + F₂?",
    options: ["(2.2, 0) N", "(6.2, 0) N", "(2.2, 3.6) N", "(2.2, −3.6) N"],
    answer: 0,
    why: "Add the components: 4.2 − 2.0 = 2.2 and −1.8 + 1.8 = 0.",
  },
];

const cards = [
  { front: "What is the equilibrium condition?", back: "The vector sum of all forces is zero: ΣF⃗ = 0." },
  { front: "What does resolving a force mean?", back: "Splitting it into perpendicular components, usually horizontal and vertical." },
  { front: "If ΣF⃗ = 0, what can you say about acceleration?", back: "Acceleration is zero — the body is at rest or moving at constant velocity." },
];

export default function ConversationFirst({ mode = "session", onBack }: { mode?: Mode; onBack?: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState("");
  const [answer, setAnswer] = useState<number | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<number[]>([]);

  const question = quizQuestions[questionIndex];
  const card = cards[cardIndex];

  return (
    <div className="lab-conversation">
      <aside className="cv-sidebar">
        <div className="cv-brand"><span className="cv-mark"><Sparkles size={16} /></span> studyai</div>
        <button className="cv-new" onClick={onBack}><ArrowLeft size={15} /> Back to canvas</button>
        <div className="cv-search"><Search size={14} /> Search sessions</div>
        <div className="cv-group">STUDY MODE</div>
        <button className={`cv-session ${mode === "session" ? "active" : ""}`} onClick={onBack}>
          Canvas session<small>{course.title}</small>
        </button>
        <button className={`cv-session ${mode === "quiz" ? "active" : ""}`} onClick={() => window.history.pushState({}, "", "?lab=conversation&mode=quiz")}>
          Quiz · {lesson.title}<small>2 questions</small>
        </button>
        <button className={`cv-session ${mode === "flashcards" ? "active" : ""}`} onClick={() => window.history.pushState({}, "", "?lab=conversation&mode=flashcards")}>
          Flashcards · forces<small>{cards.length} cards</small>
        </button>
        <div className="cv-group">EARLIER</div>
        <button className="cv-session">Lewis structures recap<small>DEMO Chemistry</small></button>
        <button className="cv-session">Vector components quiz<small>DEMO Motion</small></button>
        <div className="cv-foot"><BookOpen size={14} /> Course sources · 3 connected</div>
      </aside>

      <main className="cv-main">
        <header className="cv-head">
          <div>
            <strong>{mode === "quiz" ? "Quick quiz" : mode === "flashcards" ? "Flashcards" : lesson.title}</strong>
            <span>{mode === "session" ? course.title : `${lesson.title} · ${course.title}`}</span>
          </div>
          <button className="cv-icon" onClick={onBack}><X size={18} /></button>
        </header>

        {mode === "session" && (
          <div className="cv-thread">
            <div className="cv-user">Can you explain why the block stays at rest on the incline?</div>
            <div className="cv-answer">
              <div className="cv-avatar"><Sparkles size={15} /></div>
              <div className="cv-answer-body">
                <p>Good question. Looking at <em>your</em> board, three forces act on the block. The key is that the <strong>vector sum is zero</strong> — that is the equilibrium condition.</p>
                <div className={`cv-artifact ${expanded ? "open" : ""}`}>
                  <div className="cv-artifact-head">
                    <span className="cv-artifact-kind"><FileText size={14} /> CANVAS ARTIFACT</span>
                    <button onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
                  </div>
                  <div className="cv-artifact-title">Demo board <small>{objects.length} objects · on-canvas preview</small></div>
                  {expanded && (
                    <div className="cv-artifact-preview">
                      <div className="cv-mini-canvas">
                        <svg viewBox="0 0 320 130" aria-hidden="true">
                          <defs><marker id="cv-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L5,3 L0,6 Z" fill="currentColor" /></marker></defs>
                          <line x1="40" y1="100" x2="240" y2="30" stroke="currentColor" strokeWidth="2" markerEnd="url(#cv-arrow)" />
                          <line x1="40" y1="100" x2="240" y2="112" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" opacity=".5" />
                          <circle cx="40" cy="100" r="4" fill="currentColor" />
                        </svg>
                        <span className="cv-mini-eq">ΣF⃗ = m·a⃗ = 0</span>
                      </div>
                      <div className="cv-artifact-actions"><button>Open on canvas</button><button>Add to notes</button></div>
                    </div>
                  )}
                </div>
                <p>Your course excerpt says the same thing in words: <em>“at equilibrium, resolving forces gives…”</em> Watch the horizontal components — they cancel.</p>
                <div className="cv-citation"><Quote size={13} /> DEMO Motion · slides p. 14 <span>Open source</span></div>
                <div className="cv-suggestions">
                  {suggestions.map((suggestion) => <button key={suggestion}>{suggestion}</button>)}
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === "quiz" && (
          <div className="cv-study">
            <div className="cv-study-top">
              <span>QUESTION {questionIndex + 1} OF {quizQuestions.length}</span>
              <div className="cv-dots">{quizQuestions.map((_, i) => <i key={i} className={i === questionIndex ? "on" : i < questionIndex ? "done" : ""} />)}</div>
            </div>
            <div className="cv-question">{question.question}</div>
            <div className="cv-options">
              {question.options.map((option, index) => (
                <button
                  key={option}
                  className={`${answer === index ? (index === question.answer ? "right" : "wrong") : ""}`}
                  onClick={() => answer === null && setAnswer(index)}
                >
                  <span className="cv-option-key">{String.fromCharCode(65 + index)}</span>
                  {option}
                  {answer !== null && index === question.answer && <Check size={15} />}
                </button>
              ))}
            </div>
            {answer !== null && (
              <div className="cv-feedback">
                <strong>{answer === question.answer ? "Correct." : "Not quite."}</strong> {question.why}
                <button onClick={() => { setAnswer(null); setQuestionIndex((questionIndex + 1) % quizQuestions.length); }}>
                  Next question <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {mode === "flashcards" && (
          <div className="cv-study">
            <div className="cv-study-top">
              <span>CARD {cardIndex + 1} OF {cards.length}</span>
              <div className="cv-dots">{cards.map((_, i) => <i key={i} className={i === cardIndex ? "on" : known.includes(i) ? "done" : ""} />)}</div>
            </div>
            <button className={`cv-flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
              <span className="cv-flashcard-label">{flipped ? "ANSWER" : "QUESTION"}</span>
              <strong>{flipped ? card.back : card.front}</strong>
              <span className="cv-flashcard-hint"><RotateCcw size={12} /> click to flip</span>
            </button>
            <div className="cv-flash-actions">
              <button onClick={() => { setKnown([...known, cardIndex]); setFlipped(false); setCardIndex((cardIndex + 1) % cards.length); }}><Check size={14} /> I knew this</button>
              <button onClick={() => { setFlipped(false); setCardIndex((cardIndex + 1) % cards.length); }}>Again</button>
            </div>
          </div>
        )}

        {mode === "session" && (
          <div className="cv-composer">
            <div className="cv-input">
              <textarea rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about this lesson, your board, or a course excerpt…" />
              <button className="cv-send"><ArrowUp size={17} /></button>
            </div>
            <div className="cv-compose-bar"><SquarePen size={13} /> Grounded in your course sources <span>↵ to send</span></div>
          </div>
        )}
      </main>

      <style>{`
        .lab-conversation{display:flex;width:100vw;height:100vh;overflow:hidden;background:#fbfaf7;color:#2c2a27;font-family:'DM Sans',system-ui,sans-serif}
        .cv-sidebar{position:relative;flex:0 0 242px;padding:18px 12px;border-right:1px solid #e8e4dc;background:#f3f0e9;display:flex;flex-direction:column;gap:5px}
        .cv-brand{display:flex;align-items:center;gap:9px;padding:2px 6px 16px;font:600 18px Georgia,serif}
        .cv-mark{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:#2c2a27;color:#fff}
        .cv-new{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #ddd7cc;border-radius:8px;background:#fffdf8;color:#4a453e;font-size:11px;font-weight:600;cursor:pointer}
        .cv-search{display:flex;align-items:center;gap:8px;margin:8px 2px;padding:9px 10px;border-radius:7px;background:#eae6de;color:#8b8377;font-size:11px}
        .cv-group{margin:14px 8px 3px;color:#9c9386;font-size:9px;font-weight:700;letter-spacing:.13em}
        .cv-session{display:grid;gap:2px;padding:9px 10px;border:0;border-radius:8px;background:transparent;color:#544e46;text-align:left;font-size:11px;cursor:pointer}
        .cv-session:hover{background:#eae6de}
        .cv-session.active{background:#fffdf8;box-shadow:0 1px 2px rgba(50,40,25,.08);font-weight:600}
        .cv-session small{color:#9c9386;font-size:9px;font-weight:400}
        .cv-foot{position:absolute;left:14px;bottom:16px;display:flex;align-items:center;gap:7px;color:#9c9386;font-size:10px}
        .cv-main{flex:1;display:flex;flex-direction:column;min-width:0}
        .cv-head{display:flex;align-items:center;justify-content:space-between;height:54px;padding:0 24px;border-bottom:1px solid #eae6de;background:#fffdf8}
        .cv-head strong{display:block;font:600 14px Georgia,serif}
        .cv-head span{display:block;margin-top:2px;color:#9c9386;font-size:10px}
        .cv-icon{border:0;background:transparent;color:#8b8377;cursor:pointer}
        .cv-thread{flex:1;overflow-y:auto;padding:30px 24px 12px}
        .cv-user{max-width:600px;margin:0 auto 30px;padding:12px 16px;border-radius:12px 12px 4px 12px;background:#2c2a27;color:#f7f3ec;font-size:13px;line-height:1.6}
        .cv-answer{display:flex;gap:14px;max-width:660px;margin:0 auto}
        .cv-avatar{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#e9dfd2;color:#9a623f}
        .cv-answer-body{min-width:0}
        .cv-answer-body>p{margin:0 0 14px;font-size:13px;line-height:1.75;color:#3f3a34}
        .cv-artifact{margin:18px 0;border:1px solid #ded7ca;border-radius:11px;background:#fffdf8;overflow:hidden}
        .cv-artifact-head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #eee9e0;background:#faf7f1}
        .cv-artifact-kind{display:flex;align-items:center;gap:7px;color:#8a7f70;font-size:9px;font-weight:700;letter-spacing:.12em}
        .cv-artifact-head button{border:0;background:transparent;color:#8b8377;cursor:pointer}
        .cv-artifact-title{padding:12px 14px 0;font:600 14px Georgia,serif}
        .cv-artifact-title small{display:block;margin-top:2px;color:#9c9386;font:9px 'DM Sans',sans-serif}
        .cv-artifact-preview{padding:10px 14px 14px}
        .cv-mini-canvas{position:relative;height:132px;border:1px solid #e8e3d9;border-radius:8px;background-color:#faf8f2;background-image:radial-gradient(#ded8cc 1px,transparent 1px);background-size:14px 14px;color:#a66843}
        .cv-mini-canvas svg{position:absolute;inset:0;width:100%;height:100%;padding:6px}
        .cv-mini-eq{position:absolute;right:10px;bottom:8px;font:600 12px Georgia,serif;color:#6b6256}
        .cv-artifact-actions{display:flex;gap:7px;margin-top:10px}
        .cv-artifact-actions button{padding:7px 10px;border:1px solid #ded7ca;border-radius:7px;background:#fff;color:#5b544b;font-size:10px;font-weight:600;cursor:pointer}
        .cv-artifact-actions button:first-child{background:#2c2a27;color:#fff;border-color:#2c2a27}
        .cv-citation{display:flex;align-items:center;gap:7px;margin:14px 0;padding:9px 11px;border-left:2px solid #b98a62;background:#f6f1e9;color:#7c6f60;font-size:10px}
        .cv-citation span{margin-left:auto;color:#9a623f;font-weight:600}
        .cv-suggestions{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
        .cv-suggestions button{padding:7px 10px;border:1px solid #ded7ca;border-radius:99px;background:#fffdf8;color:#6a6258;font-size:10px;cursor:pointer}
        .cv-composer{padding:10px 24px 18px;background:linear-gradient(#fbfaf700,#fbfaf7 22%)}
        .cv-input{display:flex;align-items:flex-end;gap:10px;max-width:660px;margin:0 auto;padding:10px 12px;border:1px solid #dcd5c9;border-radius:13px;background:#fffdf8;box-shadow:0 6px 24px rgba(50,40,25,.07)}
        .cv-input textarea{flex:1;resize:none;border:0;outline:none;background:transparent;color:#3f3a34;font:13px/1.5 'DM Sans',sans-serif}
        .cv-send{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:8px;background:#2c2a27;color:#fff;cursor:pointer}
        .cv-compose-bar{max-width:660px;margin:8px auto 0;display:flex;align-items:center;gap:6px;color:#9c9386;font-size:9px}
        .cv-compose-bar span{margin-left:auto}
        .cv-study{flex:1;overflow-y:auto;padding:38px 24px;display:flex;flex-direction:column;align-items:center}
        .cv-study-top{width:100%;max-width:640px;display:flex;align-items:center;justify-content:space-between;margin-bottom:26px;color:#9c9386;font-size:10px;font-weight:700;letter-spacing:.12em}
        .cv-dots{display:flex;gap:5px}
        .cv-dots i{width:18px;height:4px;border-radius:99px;background:#ddd7cc}
        .cv-dots i.on{background:#2c2a27}
        .cv-dots i.done{background:#9a623f}
        .cv-question{max-width:640px;width:100%;font:600 21px/1.45 Georgia,serif;margin-bottom:22px}
        .cv-options{display:grid;gap:9px;max-width:640px;width:100%}
        .cv-options button{display:flex;align-items:center;gap:12px;padding:14px 15px;border:1px solid #ded7ca;border-radius:10px;background:#fffdf8;color:#4a453e;text-align:left;font-size:13px;cursor:pointer}
        .cv-options button:hover{border-color:#b98a62;background:#faf6ef}
        .cv-options button.right{border-color:#5d8f68;background:#f0f7f1;color:#3c6647}
        .cv-options button.wrong{border-color:#c9715c;background:#fdf1ee;color:#98503f}
        .cv-option-key{display:grid;place-items:center;width:25px;height:25px;flex:none;border-radius:6px;background:#eee8dd;color:#7b7265;font-size:10px;font-weight:700}
        .cv-options button svg{margin-left:auto}
        .cv-feedback{max-width:640px;width:100%;margin-top:18px;padding:14px 16px;border-left:2px solid #9a623f;background:#f6f1e9;color:#6b6257;font-size:12px;line-height:1.6}
        .cv-feedback strong{color:#3f3a34}
        .cv-feedback button{display:flex;align-items:center;gap:6px;margin:12px 0 0;padding:8px 12px;border:0;border-radius:7px;background:#2c2a27;color:#fff;font-size:11px;cursor:pointer}
        .cv-flashcard{width:100%;max-width:560px;min-height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:30px;border:1px solid #ded7ca;border-radius:16px;background:#fffdf8;box-shadow:0 14px 40px rgba(50,36,20,.09);cursor:pointer;color:#2c2a27}
        .cv-flashcard.flipped{background:#f6efe5;border-color:#c9b298}
        .cv-flashcard-label{color:#9c9386;font-size:9px;font-weight:700;letter-spacing:.16em}
        .cv-flashcard strong{font:600 24px/1.45 Georgia,serif;text-align:center;max-width:440px}
        .cv-flashcard-hint{display:flex;align-items:center;gap:6px;color:#a49a8c;font-size:10px}
        .cv-flash-actions{display:flex;gap:9px;margin-top:22px}
        .cv-flash-actions button{display:flex;align-items:center;gap:7px;padding:10px 16px;border:1px solid #ded7ca;border-radius:8px;background:#fffdf8;color:#5b544b;font-size:11px;font-weight:600;cursor:pointer}
        .cv-flash-actions button:first-child{background:#2c2a27;color:#fff;border-color:#2c2a27}
      `}</style>
    </div>
  );
}
