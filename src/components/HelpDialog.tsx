import { useEffect } from "react";
import { CircleHelp, Settings2, X } from "lucide-react";

type Props = { onClose: () => void; onOpenSettings: () => void; onOpenCanvas: () => void };

export default function HelpDialog({ onClose, onOpenSettings, onOpenCanvas }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-modal help-modal" role="dialog" aria-label="StudyAI help" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">GUIDE</span><h2>StudyAI help</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close help"><X size={18} /></button>
        </div>

        <div className="help-sections">
          <section><h3>Canvas tools</h3><p>Open the tool palette on the left of the board. Draw and Science groups place lines, vectors, forces, equations and Lewis structures; the Learning group adds concepts, links and questions. Use the search field to find a tool.</p></section>
          <section><h3>Recognize and review</h3><p><b>Analyze board</b> reads the strokes you have drawn and makes the result available to the tutor. <b>Labels</b> lets you teach a label, then accept, correct or dismiss recognition candidates. Re-run Analyze board after changing the drawing.</p></section>
          <section><h3>Canvas controls</h3><p>Undo and redo sit beside the board selector. Select an object and use <b>Inspect</b> to edit its numbers; selection also works with the pointer tool. Pan and zoom use the canvas gestures.</p></section>
          <section><h3>Views and tutor</h3><p>Canvas, Lecture and Split switch what fills the stage. Ask the tutor about your lesson or board; cited pages open in the reader. The tutor menu starts a new conversation, toggles lesson context and copies the last answer.</p></section>
          <section><h3>Keyboard</h3><p><b>⌘K / Ctrl+K</b> opens course search. <b>Escape</b> closes any dialog or menu. Search results open the matching page or slide in the reader.</p></section>
        </div>

        <div className="help-actions">
          <button className="button-soft" onClick={onOpenCanvas}><CircleHelp size={14} /> Go to canvas</button>
          <button className="button-primary" onClick={onOpenSettings}><Settings2 size={14} /> Open settings</button>
        </div>
      </section>
      <style>{`
        .help-modal{width:min(620px,92vw)}
        .help-sections{display:grid;gap:12px;max-height:56vh;overflow:auto;margin:14px 0}
        .help-sections section{padding:11px 13px;border:1px solid #ece5d9;border-radius:9px;background:#fbf9f4}
        .help-sections h3{margin:0 0 5px;font:600 12px Georgia,serif;color:#3f3a34}
        .help-sections p{margin:0;color:#6f665a;font-size:11px;line-height:1.6}
        .help-actions{display:flex;justify-content:flex-end;gap:8px}
      `}</style>
    </div>
  );
}
