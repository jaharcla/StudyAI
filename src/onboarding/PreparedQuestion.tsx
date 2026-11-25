/**
 * The post-drop landing: one source-grounded question the student chooses to send.
 * No supported passage means no question, no citation and no invented answer.
 */
import { Sparkles } from "lucide-react";
import { Citation } from "../components/document-intelligence/Citation.js";

export type PreparedQuestionProps = {
  question: string;
  onSend: (text: string) => void;
  title?: string;
  sourceRef?: string;
  onOpenSource?: (sourceRef: string) => void;
};

export function PreparedQuestion({ question, onSend, title, sourceRef, onOpenSource }: PreparedQuestionProps) {
  if (!question) {
    return (
      <div className="tutor-context" data-testid="prepared-question" role="status">
        <div className="context-label"><span>PREPARED QUESTION</span></div>
        <p>No supported passage was found in your course material yet, so no question was prepared. Nothing was generated — add a source or try again.</p>
      </div>
    );
  }
  return (
    <div className="tutor-context" data-testid="prepared-question">
      <div className="context-label"><span>PREPARED QUESTION</span></div>
      <p>{question}</p>
      {sourceRef && <Citation sourceRef={sourceRef} title={title} compact onOpen={onOpenSource} />}
      <button type="button" className="daily-primary" data-testid="prepared-question-send" onClick={() => onSend(question)}><Sparkles size={13} /> Ask this question</button>
    </div>
  );
}
