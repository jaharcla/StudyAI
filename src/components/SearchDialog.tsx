import { useEffect, useRef, useState } from "react";
import { FileText, Search, X } from "lucide-react";
import type { SearchHit } from "./document-intelligence/api";
import { API } from "../api";
import { useDialogFocus } from "./useDialogFocus";

type Props = { courseId: string; onClose: () => void; onOpen: (sourceRef: string) => void };

export default function SearchDialog({ courseId, onClose, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(true, dialogRef, inputRef);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!courseId || !query.trim()) { setResults([]); setError(""); return; }
    let live = true;
    setBusy(true);
    const timer = window.setTimeout(() => {
      fetch(`${API}/document-intelligence/search?course=${encodeURIComponent(courseId)}&q=${encodeURIComponent(query)}`)
        .then(async (response) => {
          const value = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(value.error || "Search is unavailable.");
          return value as { results: SearchHit[] };
        })
        .then((value) => { if (live) { setResults(value.results); setError(""); } })
        .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : "Search failed."); })
        .finally(() => { if (live) setBusy(false); });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [courseId, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} className="settings-modal search-modal" role="dialog" aria-label="Search course materials" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">COURSE MATERIALS</span><h2>Search</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close search"><X size={18} /></button>
        </div>
        <div className="search-field"><Search size={16} /><input ref={inputRef} aria-label="Search query" value={query} placeholder="Search titles and document text" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && results[0]) onOpen(results[0].sourceRef); }} /></div>
        {!courseId && <p className="search-hint">Select a course to search its materials.</p>}
        {error && <p className="search-hint" role="alert">{error}</p>}
        {busy && !error && <p className="search-hint">Searching…</p>}
        {!busy && !error && courseId && !query.trim() && <p className="search-hint">Type a word or phrase to find course material.</p>}
        {!busy && !error && query.trim() && results.length === 0 && <p className="search-hint">No matches in this course.</p>}
        <div className="search-results">
          {results.map((hit) => (
            <button key={hit.sourceRef} className="search-result" onClick={() => onOpen(hit.sourceRef)}>
              <FileText size={15} />
              <span><b>{hit.title}</b><small>{hit.unitType} {hit.unitNumber}</small><em>{hit.excerpt}</em></span>
              <span className="search-open">Open source</span>
            </button>
          ))}
        </div>
      </section>
      <style>{`
        .search-modal{width:min(620px,92vw)}
        .search-field{display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid #ded7c9;border-radius:9px;color:#8a8072}
        .search-field input{flex:1;border:0;outline:none;background:transparent;color:#3f3a34;font:13px 'DM Sans',sans-serif}
        .search-hint{margin:14px 2px;color:#645b4e;font-size:11px}
        .search-results{display:grid;gap:4px;margin-top:12px;max-height:46vh;overflow:auto}
        .search-result{display:flex;align-items:flex-start;gap:10px;padding:11px;border:1px solid #ece5d9;border-radius:9px;background:#fffdf8;color:#574e43;text-align:left;cursor:pointer}
        .search-result:hover{border-color:#a66843;background:#fbf7f1}
        .search-result>span:nth-child(2){display:grid;gap:2px;flex:1;min-width:0}
        .search-result b{font-size:12px}
        .search-result small{color:#6b6256;font-size:9px}
        .search-result em{color:#6f665a;font-size:11px;font-style:normal;line-height:1.5;overflow-wrap:anywhere}
        .search-open{color:#9a623f;font-size:10px;font-weight:600;white-space:nowrap}
      `}</style>
    </div>
  );
}
