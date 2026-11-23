/**
 * Corpus for measuring whether a question about something drawn on the canvas reaches the course
 * passage that answers it. Lectures are imported through the real document-intelligence path so
 * chunking, FTS5 indexing and bm25 ranking are the production ones, not a simulation.
 *
 * `board` holds only things the canvas layer can actually supply for a board: recognized object
 * kinds, OCR'd label text, and relations. It is deliberately NOT a hand-written query, because the
 * point is to measure what a board-informed retrieval query would be worth, not to invent one.
 *
 * `needle` is a phrase that appears in exactly one passage of one lecture. A hit means that
 * passage, and only that passage, came back.
 */
export type GroundingCase = {
  id: string;
  title: string;
  lecture: { filename: string; text: string };
  board: string[];
  utterance: string;
  needle: string;
  /** Cases with no needle exist only to prove the gate still declines retrieval where it should. */
  expectGate: boolean;
  why: string;
};

export const groundingCases: GroundingCase[] = [
  {
    id: "spring-overshoot",
    title: "Freehand spring diagram, asking why it overshoots",
    lecture: {
      filename: "14.2 Undamped oscillation.txt",
      text:
        "Undamped oscillation. A mass on an ideal spring experiences a restoring force proportional to its displacement from equilibrium, directed back toward equilibrium. Release the mass from rest at an initial displacement and it accelerates through the equilibrium point, carrying momentum, so it continues to the far side. Energy conservation fixes the far turning point: starting from rest, the spring extends to twice the initial displacement before reversing, and this symmetric excursion is called overshoot. Damping is what removes it.",
    },
    board: ["spring", "wall", "mass", "displacement", "arrow"],
    utterance: "why does the spring in my diagram overshoot the equilibrium position",
    needle: "twice the initial displacement",
    expectGate: true,
    why: "The old rule vetoed this outright because it says 'diagram'. The referent is the drawing, not the words.",
  },
  {
    id: "normal-force-arrow",
    title: "Freebody sketch, asking whether the upward arrow is a force",
    lecture: {
      filename: "05.1 Contact forces.txt",
      text:
        "Contact forces. When a block rests on a table the table pushes back. That push is the normal force: a perpendicular contact reaction produced by microscopic deformation of both surfaces, not a stored or passive response. 'Normal' means perpendicular, so the force is drawn at right angles to the surface regardless of the surface tilt. It adjusts to whatever the other contacts require and has no fixed magnitude of its own.",
    },
    board: ["block", "arrow up", "table", "label N"],
    utterance: "is the upward arrow I drew a real force or just a reaction",
    needle: "perpendicular contact reaction",
    expectGate: true,
    why: "Nothing in the sentence names the lecture; the drawing is what makes 'reaction' mean contact normal.",
  },
  {
    id: "sigmoid-denominator",
    title: "Handwritten logistic expression, asking about its denominator",
    lecture: {
      filename: "07.3 Saturating units.txt",
      text:
        "Saturating units. The logistic function maps any real input into the open interval between zero and one by placing the exponential term in the denominator. As its argument grows large and positive the denominator dominates and the output approaches one; large and negative and the output approaches zero. In that flat regime the derivative saturates toward zero, so a gradient signal passed back through the unit shrinks layer by layer and early parameters stop learning.",
    },
    board: ["x_i", "\\frac{1}{1+e^{-", "sigma", "fraction"],
    utterance: "what does the denominator do to the gradient here",
    needle: "saturates toward zero",
    expectGate: true,
    why: "'here' is a handwritten expression; the bridge from fraction to vanishing gradient is the model's to make.",
  },
  {
    id: "superposition-basis",
    title: "Handwritten bra-ket sum, asking which basis it ranges over",
    lecture: {
      filename: "09.1 Superposition.txt",
      text:
        "Superposition. A state written as a sum over bit strings attached to kets is expanded in the computational basis, the distinguished set of states indexed by classical bit strings. The amplitudes are the coefficients of that expansion and the basis is part of the notation's meaning: the same physical state is a different sum in the Hadamard basis, so a sum's subscript tells you which basis was chosen before any measurement.",
    },
    board: ["\\sum", "|x\\rangle", "ket", "0,1"],
    utterance: "which basis is this superposition over",
    needle: "computational basis",
    expectGate: true,
    why: "No board noun in the sentence, so the gate allows it; 'basis' happens to be shared with the lecture.",
  },
  {
    id: "halflife-floor",
    title: "Handwritten decay expression, asking where the curve lands",
    lecture: {
      filename: "11.4 Exponential decay.txt",
      text:
        "Exponential decay. The half-life is the interval in which a quantity falls to one half of its starting value. Because each interval halves what remains rather than a fixed amount, the quantity never reaches zero: after five half-lives about three percent survives, and the curve approaches the axis asymptotically. Practical detection limits, not the equation, decide when the remainder stops mattering.",
    },
    board: ["N(t)", "N_0", "t_{1/2}", "2^{-t"],
    utterance: "does the curve I drew fall to zero after five of these",
    needle: "about three percent",
    expectGate: true,
    why: "'these' can only be resolved from the ink; the sentence on its own names no quantity.",
  },
  {
    id: "partial-held-constant",
    title: "Handwritten partial derivative, asking what is held fixed",
    lecture: {
      filename: "12.2 Generalized coordinates.txt",
      text:
        "Generalized coordinates. A partial derivative with respect to one coordinate means holding the remaining coordinates fixed while varying it, which is why the subscript naming the coordinate set is part of the operator and not decoration. Change the coordinate set and the same symbol differentiates a different function, because the quantities frozen in the two cases are not the same quantities.",
    },
    board: ["\\partial", "\\xi^{i}", "f", "fraction"],
    utterance: "why is something held constant when I differentiate this way",
    needle: "holding the remaining coordinates fixed",
    expectGate: true,
    why: "No board noun appears, so the gate passes; the referent of 'this way' is only recoverable from the ink.",
  },
  {
    id: "control-board-description",
    title: "Control: a plain description request now prefetches, and the model must ignore the noise",
    lecture: {
      filename: "14.2 Undamped oscillation (control).txt",
      text: "Undamped oscillation. A mass on an ideal spring experiences a restoring force proportional to its displacement.",
    },
    board: ["spring", "wall"],
    utterance: "can you tell me what is on the board",
    needle: "",
    expectGate: true,
    why: "No longer declined by rule. The excerpts it pulls are irrelevant, and ignoring them is now the model's job, not a regex's.",
  },
  {
    id: "control-explicit-source",
    title: "Control: an explicitly source-named question already worked",
    lecture: {
      filename: "05.4 Friction limits (control).txt",
      text:
        "Friction limits. Static friction takes whatever value the balance of forces requires up to a ceiling, and that ceiling is reached just before sliding begins. Beyond it the surfaces have broken free and kinetic friction, which is smaller, takes over.",
    },
    board: ["block", "arrow right", "label f"],
    utterance: "according to my lecture notes what is the maximum static friction",
    needle: "just before sliding begins",
    expectGate: true,
    why: "Always allowed: it names a source and shares the term 'friction' with the lecture.",
  },
  {
    id: "control-greeting",
    title: "Control: a greeting asks nothing",
    lecture: {
      filename: "14.3 Greeting control.txt",
      text: "Simple harmonic motion has a period independent of amplitude only for small oscillations of a pendulum.",
    },
    board: ["pendulum"],
    utterance: "Hello!",
    needle: "",
    expectGate: false,
    why: "Containment that survives: there is no question here to ground.",
  },
  {
    id: "control-exact-output",
    title: "Control: an exact-output instruction must not collect citations",
    lecture: {
      filename: "14.4 Exact output control.txt",
      text: "Amortization schedules compound interest monthly, and the effective annual rate exceeds the nominal rate.",
    },
    board: ["table"],
    utterance: "Reply with exactly: STUDYAI-GROQ-CONNECTED",
    needle: "",
    expectGate: false,
    why: "Containment that survives: the student asked for a specific string, not for course material.",
  },
];
