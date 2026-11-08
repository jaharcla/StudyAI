import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronRight, CloudUpload, FileText, LoaderCircle, Search, Trash2, TriangleAlert, X } from "lucide-react";
import { Citation } from "./Citation.js";
import { DocumentViewer } from "./DocumentViewer.js";
import { DOCUMENT_API, type LibraryDocument, type SearchHit, parseSourceReference, requestJson, uploadOne } from "./api.js";

type Course = { id: string; title: string };
type Upload = { id: string; file: File; status: "queued" | "uploading" | "imported" | "duplicate" | "error"; progress: number; message?: string; documentId?: string };
type Props = { courseId: string; courses?: Course[]; onCourseChange?: (courseId: string) => void; initialSourceRef?: string; initialSourceKey?: number; initialQuery?: string };

export function DocumentLibrary({ courseId, courses = [], onCourseChange, initialSourceRef, initialSourceKey, initialQuery }: Props) {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [query, setQuery] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<{ documentId: string; sourceRef?: string }>();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async (search = query) => {
    const currentRequest = ++requestId.current;
    if (!courseId) { setDocuments([]); setHits([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await requestJson<{ documents: LibraryDocument[]; results: SearchHit[] }>(DOCUMENT_API + "/documents?course=" + encodeURIComponent(courseId) + "&q=" + encodeURIComponent(search));
      if (currentRequest === requestId.current) {
        setDocuments(data.documents);
        setHits(data.results);
        setError("");
      }
    } catch (reason) {
      if (currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : "Could not load the document library.");
    } finally { if (currentRequest === requestId.current) setLoading(false); }
  }, [courseId, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(query); }, 180);
    return () => window.clearTimeout(timer);
  }, [refresh, query]);

  useEffect(() => {
    if (!initialSourceRef) return;
    const source = parseSourceReference(initialSourceRef);
    if (source) setViewer({ documentId: source.documentId, sourceRef: initialSourceRef });
  }, [initialSourceRef, initialSourceKey]);

  useEffect(() => { if (initialQuery !== undefined) setQuery(initialQuery); }, [initialQuery]);

  const importFiles = async (files: File[]) => {
    if (!files.length || !courseId) return;
    const accepted: File[] = [];
    const rejected: Upload[] = [];
    let bytes = 0;
    for (const file of files.slice(0, 20)) {
      bytes += file.size;
      const validType = /\.(pdf|docx|pptx|txt)$/i.test(file.name);
      const message = !validType ? "Supported formats: PDF, DOCX, PPTX, TXT." : file.size > 20 * 1024 * 1024 ? "File exceeds 20 MB." : bytes > 50 * 1024 * 1024 ? "Batch exceeds 50 MB." : "";
      if (message) rejected.push({ id: crypto.randomUUID(), file, status: "error", progress: 0, message });
      else accepted.push(file);
    }
    if (files.length > 20) rejected.push({ id: crypto.randomUUID(), file: files[20], status: "error", progress: 0, message: "A batch can contain at most 20 files." });
    const jobs: Upload[] = [...rejected, ...accepted.map((file) => ({ id: crypto.randomUUID(), file, status: "queued" as const, progress: 0 }))];
    setUploads((current) => [...jobs, ...current].slice(0, 40));
    for (const job of jobs) {
      if (job.status === "error") continue;
      setUploads((current) => current.map((item) => item.id === job.id ? { ...item, status: "uploading", progress: 0 } : item));
      const result = await uploadOne(job.file, courseId, (progress) => setUploads((current) => current.map((item) => item.id === job.id ? { ...item, progress } : item)));
      setUploads((current) => current.map((item) => item.id === job.id ? { ...item, status: result.status, progress: result.status === "error" ? item.progress : 100, message: result.message, documentId: result.documentId } : item));
      if (result.status === "imported") await refresh(query);
    }
  };

  const deleteItem = async (document: LibraryDocument) => {
    if (!window.confirm("Delete “" + document.title + "” and its indexed text?")) return;
    try {
      await requestJson<{ deleted: boolean }>(DOCUMENT_API + "/documents/" + encodeURIComponent(document.id) + "?course=" + encodeURIComponent(courseId), { method: "DELETE" });
      if (viewer?.documentId === document.id) setViewer(undefined);
      await refresh(query);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete document."); }
  };

  const openSource = (sourceRef: string) => {
    const source = parseSourceReference(sourceRef);
    if (source) setViewer({ documentId: source.documentId, sourceRef });
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void importFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <section className="di-library">
      <header className="di-library-header">
        <div><span className="di-eyebrow">COURSE KNOWLEDGE</span><h2>Document library</h2><p>Import and search the materials you want to study.</p></div>
        {courses.length > 0 && onCourseChange && <label className="di-course-select"><span>Course</span><select value={courseId} onChange={(event) => onCourseChange(event.target.value)}>{courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select></label>}
      </header>

      <div className={"di-dropzone" + (dragging ? " di-dropzone-active" : "")} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={handleDrop}>
        <input ref={inputRef} className="di-file-input" type="file" accept=".pdf,.docx,.pptx,.txt" multiple onChange={(event) => { void importFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <div className="di-upload-mark"><CloudUpload size={23} /></div>
        <div><strong>Drop course materials here</strong><span>PDF, DOCX, PPTX, TXT · up to 20 files · 20 MB per file</span></div>
        <button type="button" className="di-primary-button" onClick={() => inputRef.current?.click()}>Choose files</button>
      </div>

      {uploads.length > 0 && <div className="di-upload-list" aria-live="polite">
        <div className="di-section-heading"><h3>Recent imports</h3><button className="di-text-button" onClick={() => setUploads([])}>Clear</button></div>
        {uploads.map((upload) => <div className="di-upload-row" key={upload.id}>
          <FileText size={16} /><div className="di-upload-copy"><strong>{upload.file.name}</strong><span>{upload.status === "uploading" ? "Uploading…" : upload.message || upload.status}</span>{upload.status === "uploading" && <div className="di-progress"><i style={{ width: upload.progress + "%" }} /></div>}</div>
          {upload.status === "uploading" && <span className="di-upload-percent">{upload.progress}%</span>}
          {upload.status === "imported" && <Check className="di-success-icon" size={16} />}
          {upload.status === "duplicate" && <span className="di-duplicate-pill">Duplicate</span>}
          {upload.status === "error" && <TriangleAlert className="di-error-icon" size={16} />}
          {upload.status === "queued" && <LoaderCircle className="di-muted-icon" size={16} />}
        </div>)}
      </div>}

      {error && <div className="di-error di-inline-error"><TriangleAlert size={16} />{error}<button className="di-icon-button" onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div>}

      <div className="di-library-toolbar">
        <div className="di-library-count"><h3>Sources</h3><span>{documents.length}</span></div>
        <label className="di-library-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles and document text" /><kbd>⌘ K</kbd></label>
      </div>

      {query.trim() && hits.length > 0 && <div className="di-search-results">
        <span className="di-eyebrow">MATCHING PASSAGES</span>
        {hits.map((hit) => <div className="di-search-hit" key={hit.sourceRef}>
          <button className="di-search-hit-main" onClick={() => openSource(hit.sourceRef)}><span className="di-hit-copy"><strong>{hit.title}</strong><small>{hit.excerpt}</small></span></button>
          <Citation sourceRef={hit.sourceRef} title="" compact onOpen={openSource} />
        </div>)}
      </div>}

      {loading ? <div className="di-library-state">Loading course sources…</div>
        : documents.length ? <div className="di-document-grid">{documents.map((document) => <article className="di-document-card" key={document.id}>
          <button className="di-document-open" onClick={() => setViewer({ documentId: document.id })}>
            <span className="di-document-icon"><FileText size={19} /></span><span className="di-document-main"><strong>{document.title}</strong><small>{document.filename}</small></span><ChevronRight size={16} className="di-document-chevron" />
          </button>
          <div className="di-document-meta"><span>{formatType(document.mimeType)}</span><span>{document.unitCount} {document.mimeType.includes("presentation") ? "slides" : document.mimeType === "application/pdf" ? "pages" : "text units"}</span><time>{formatDate(document.importedAt)}</time><button className="di-delete-button" title="Delete document" onClick={() => void deleteItem(document)}><Trash2 size={14} /></button></div>
        </article>)}</div>
        : <div className="di-library-state"><BookOpen size={25} /><strong>{query ? "No matching documents" : "No documents yet"}</strong><span>{query ? "Try another title or phrase." : "Add a PDF, presentation, document, or text file to begin."}</span></div>}

      {viewer && <DocumentViewer documentId={viewer.documentId} courseId={courseId} sourceRef={viewer.sourceRef} onClose={() => setViewer(undefined)} />}
    </section>
  );
}

function formatType(mime: string) { return mime === "application/pdf" ? "PDF" : mime.includes("presentation") ? "PPTX" : mime.includes("wordprocessingml") ? "DOCX" : "TXT"; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date); }
