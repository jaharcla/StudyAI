import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { API } from "../api";

type IndexedSource = { documentId: string; title: string; page: number | null; excerpt: string };
type Props = { courseId: string; lessonId: string; close: () => void; onCreated: () => void; initialSource?: IndexedSource | null };

export default function QuestionAuthor({ courseId, lessonId, close, onCreated, initialSource }: Props) {
  const [sources, setSources] = useState<IndexedSource[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [concept, setConcept] = useState("");
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [excerpt, setExcerpt] = useState("");
  const [sourcePage, setSourcePage] = useState<number | null>(null);
  const [explanation, setExplanation] = useState("The cited source supports the correct choice.");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`${API}/study/sources?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`)
      .then(async (response) => {
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(value.error || "Course sources could not be loaded.");
        return (value as { sources: IndexedSource[] }).sources;
      })
      .then((value) => {
        if (!live) return;
        const list = initialSource && !value.some((item) => item.documentId === initialSource.documentId && item.excerpt === initialSource.excerpt) ? [initialSource, ...value] : value;
        setSources(list);
        const start = initialSource ?? list[0];
        if (start) { setDocumentId(start.documentId); setExcerpt(start.excerpt); setSourcePage(start.page); }
      })
      .catch((reason) => { if (live) setStatus(reason instanceof Error ? reason.message : "Course sources could not be loaded."); });
    return () => { live = false; };
  }, [courseId, lessonId, initialSource]);

  const documents = useMemo(() => {
    const seen = new Set<string>();
    return sources.filter((source) => { if (seen.has(source.documentId)) return false; seen.add(source.documentId); return true; });
  }, [sources]);
  const documentSources = sources.filter((source) => source.documentId === documentId);
  const attachedTitle = documents.find((source) => source.documentId === documentId)?.title;

  function chooseDocument(id: string) {
    setDocumentId(id);
    const first = sources.find((source) => source.documentId === id);
    setExcerpt(first?.excerpt ?? "");
    setSourcePage(first?.page ?? null);
  }
  function editExcerpt(value: string) {
    setExcerpt(value);
    const match = documentSources.find((source) => source.excerpt === value);
    setSourcePage(match ? match.page : null);
  }

  const save = async () => {
    if (!concept.trim()) { setStatus("Add a concept name."); return; }
    if (!prompt.trim()) { setStatus("Add a question prompt."); return; }
    if (choices.some((value) => !value.trim())) { setStatus("Fill in both choices."); return; }
    if (!documentId) { setStatus("Choose a source document from your course."); return; }
    if (!excerpt.trim()) { setStatus("Choose an excerpt from the attached source."); return; }
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
          sourcePage,
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
      <section className="settings-modal" role="dialog" aria-label="Add a reviewed question" aria-modal="true" data-testid="question-author" style={{ maxHeight: "calc(100vh - 32px)", overflowY: "auto" }} onMouseDown={(event) => event.stopPropagation()}>
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
        <label>Source document<select aria-label="Source document" value={documentId} onChange={(event) => chooseDocument(event.target.value)}>
          {!documents.length && <option value="">No indexed course text</option>}
          {documents.map((source) => <option key={source.documentId} value={source.documentId}>{source.title}</option>)}
        </select></label>
        {documentSources.length > 1 && <label>Suggested excerpt<select aria-label="Suggested excerpt" onChange={(event) => {
          const source = documentSources[Number(event.target.value)];
          setExcerpt(source.excerpt); setSourcePage(source.page);
        }}>
          {documentSources.map((source, index) => <option key={`${source.documentId}:${source.page ?? 0}:${index}`} value={index}>{source.page ? `Page ${source.page}` : "Excerpt"} · {source.excerpt.slice(0, 70)}</option>)}
        </select></label>}
        <label>Source excerpt<textarea aria-label="Source excerpt" value={excerpt} onChange={(event) => editExcerpt(event.target.value)} placeholder="Paste the exact text from the source" /></label>
        {documentId && <p className="study-citation" data-testid="attached-source">Attached source: {attachedTitle}{sourcePage ? `, p. ${sourcePage}` : ""} — {excerpt.slice(0, 160)}</p>}
        {!sources.length && <p className="study-status">No indexed course text is available for this lesson. Import a document in the library first.</p>}
        <label>Explanation<textarea aria-label="Explanation" value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label>
        {status && <p role="status">{status}</p>}
        <button className="button-primary" disabled={busy || !sources.length} onClick={() => void save()}>Save question</button>
      </section>
    </div>
  );
}
