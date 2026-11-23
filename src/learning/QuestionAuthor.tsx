import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { API } from "../api";

type SourceDocument = { id: string; course_id: string; title: string; imported_at: string };

export default function QuestionAuthor({ courseId, lessonId, close, onCreated }: { courseId: string; lessonId: string; close: () => void; onCreated: () => void }) {
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [concept, setConcept] = useState("");
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [excerpt, setExcerpt] = useState("");
  const [explanation, setExplanation] = useState("The cited source supports the correct choice.");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`${API}/documents?course=${encodeURIComponent(courseId)}`)
      .then(async (response) => {
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(value.error || "Documents could not be loaded.");
        return value as SourceDocument[];
      })
      .then((value) => { if (live) { setDocuments(value); if (value.length) setDocumentId(value[0].id); } })
      .catch(() => { if (live) setStatus("Documents could not be loaded."); });
    return () => { live = false; };
  }, [courseId]);

  const save = async () => {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(`${API}/study/questions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          courseId, lessonId, concept, prompt,
          choices: choices.map((text, index) => ({ id: `c${index + 1}`, text })),
          correctChoice: `c${correctIndex + 1}`,
          explanation,
          sourceDocumentId: documentId,
          sourceExcerpt: excerpt,
          reviewed: true,
        }),
      });
      const value = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(value.error || "The question could not be saved.");
      onCreated();
      close();
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "The question could not be saved.");
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="settings-modal" role="dialog" aria-label="Add a reviewed question" aria-modal="true" data-testid="question-author" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">QUESTION BANK</span><h2>Add a question</h2></div>
          <button className="icon-button" onClick={close} aria-label="Close question editor"><X size={18} /></button>
        </div>
        <label>Concept<input value={concept} onChange={(event) => setConcept(event.target.value)} /></label>
        <label>Prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
        <fieldset>
          <legend>Choices</legend>
          {choices.map((text, index) => (
            <div key={index} className="activity-list-row">
              <label><input type="radio" name="correct-choice" checked={correctIndex === index} onChange={() => setCorrectIndex(index)} aria-label={`Correct choice for Choice ${index + 1}`} /> Correct</label>
              <label>{`Choice ${index + 1}`}<input value={text} onChange={(event) => setChoices((current) => current.map((item, i) => i === index ? event.target.value : item))} /></label>
            </div>
          ))}
        </fieldset>
        <label>Source document<select aria-label="Source document" value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
          {!documents.length && <option value="">No documents imported</option>}
          {documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
        </select></label>
        <label>Source excerpt<textarea aria-label="Source excerpt" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="Paste the exact text from the source" /></label>
        <label>Explanation<textarea aria-label="Explanation" value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label>
        {status && <p role="status">{status}</p>}
        <button className="button-primary" disabled={busy} onClick={() => void save()}>Save question</button>
      </section>
    </div>
  );
}
