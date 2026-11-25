/**
 * One-drop intake: create the course, the lesson and the index from one file drop.
 * All substance comes from the dropped files; failures stay explicit and retryable.
 */
import { useEffect, useRef, useState } from "react";
import { CloudUpload, LoaderCircle, TriangleAlert } from "lucide-react";
import { API } from "../api.js";
import { requestJson, uploadOne } from "../components/document-intelligence/api.js";
import { inferCourseContext } from "./context.js";
import "../today/daily-surfaces.css";

type Phase = "idle" | "creating" | "uploading" | "indexing" | "ready" | "error";
type IntakeContext = { courseId: string; lessonId: string; courseTitle: string; lessonTitle: string };
const SUPPORTED = /\.(pdf|docx|pptx|txt)$/i;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function OneDropSurface({ onReady }: { onReady: (context: IntakeContext) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [files, setFiles] = useState<readonly File[]>([]);
  const [context, setContext] = useState({ courseTitle: "", lessonTitle: "" });
  const [dragging, setDragging] = useState(false);
  const ids = useRef({ courseId: "", lessonId: "" });
  const live = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  const update = (next: Phase, text: string) => {
    if (!live.current) return;
    setPhase(next);
    setMessage(text);
  };

  const intake = async (selected: readonly File[]) => {
    if (!selected.length) return;
    const bad = selected.find((file) => !SUPPORTED.test(file.name) || file.size > MAX_FILE_BYTES);
    if (bad) {
      setFiles([]);
      update("error", !SUPPORTED.test(bad.name)
        ? `Unsupported format: ${bad.name}. Supported formats: PDF, DOCX, PPTX, TXT.`
        : `${bad.name} exceeds 20 MB.`);
      return;
    }

    setFiles(selected);
    const inferred = inferCourseContext(selected);
    setContext(inferred);
    update("creating", `Creating ${inferred.courseTitle || "your course"}…`);
    try {
      if (!ids.current.courseId) {
        const course = await requestJson<{ id: string }>(`${API}/courses`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: inferred.courseTitle }),
        });
        if (!live.current) return;
        ids.current.courseId = course.id;
      }
      if (!ids.current.lessonId) {
        const lesson = await requestJson<{ id: string }>(`${API}/lessons`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId: ids.current.courseId, title: inferred.lessonTitle }),
        });
        if (!live.current) return;
        ids.current.lessonId = lesson.id;
      }

      update("uploading", "Uploading your sources…");
      let indexed = 0;
      for (const file of selected) {
        if (!live.current) return;
        setPhase("uploading");
        const result = await uploadOne(file, ids.current.courseId, (value) => {
          if (!live.current) return;
          setProgress(value);
          if (value >= 100) setPhase("indexing");
        }, ids.current.lessonId);
        if (!live.current) return;
        if (result.status === "error") { update("error", result.message || "Upload failed."); return; }
        indexed += 1;
      }
      update("ready", `Indexed ${indexed} source${indexed === 1 ? "" : "s"} into ${inferred.courseTitle}.`);
      if (live.current) onReady({ ...ids.current, ...inferred });
    } catch (error) {
      update("error", error instanceof Error ? error.message : "Could not prepare your course.");
    }
  };

  const retry = () => {
    if (!files.length) { inputRef.current?.click(); return; }
    void intake(files);
  };

  return (
    <section className="home-surface" aria-label="Course intake" data-testid="one-drop-surface">
      <div className={"home-dropzone" + (dragging ? " home-dropzone-active" : "")} data-testid="one-drop-zone"
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void intake(Array.from(event.dataTransfer.files)); }}>
        <input ref={inputRef} data-testid="one-drop-input" className="home-file-input" type="file" accept=".pdf,.docx,.pptx,.txt" multiple
          onChange={(event) => { void intake(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <CloudUpload size={22} aria-hidden="true" />
        <div><strong>Drop your course files here</strong><span>PDF, DOCX, PPTX or TXT · up to 20 MB per file</span></div>
        <button type="button" className="daily-primary" onClick={() => inputRef.current?.click()}>Choose files</button>
      </div>

      <div className="home-indexing" data-testid="one-drop-progress" aria-live="polite">
        {phase === "idle" && <span>No files yet. Drop course files to create a course and lesson.</span>}
        {phase === "creating" && <span>Creating your course…</span>}
        {phase === "uploading" && <span>Uploading {progress}%…</span>}
        {phase === "indexing" && <span>Indexing your sources…</span>}
        {phase === "ready" && <span>{message}</span>}
        {phase === "error" && <span>{message}</span>}
        {(phase === "uploading" || phase === "indexing") && <div className="home-progress"><i style={{ width: `${progress}%` }} /></div>}
        {(phase === "uploading" || phase === "indexing") && <LoaderCircle size={14} className="home-spin" aria-hidden="true" />}
      </div>

      {phase === "error" && <div className="home-error" data-testid="one-drop-error" role="alert">
        <TriangleAlert size={14} aria-hidden="true" />{message}
        <button type="button" className="daily-quiet" data-testid="one-drop-retry" onClick={retry}>Try again</button>
      </div>}

      {phase === "ready" && <div className="home-summary" data-testid="one-drop-ready">
        <strong>{context.courseTitle}</strong><span>{context.lessonTitle}</span>
      </div>}
    </section>
  );
}
