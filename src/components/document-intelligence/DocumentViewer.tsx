import { useEffect, useMemo, useState } from "react";
import { Document as PdfDocument, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Minus, Plus, Search, X } from "lucide-react";
import "react-pdf/dist/Page/TextLayer.css";
import { DOCUMENT_API, type DocumentData, type UnitType, requestJson, sourceDocumentUrl, parseSourceReference } from "./api.js";
import { clampUnitNumber, findDocumentMatches, nextMatchIndex } from "./navigation.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type Props = { documentId: string; courseId: string; sourceRef?: string; onClose: () => void };
type Match = { unitNumber: number; unitType: UnitType; offset: number };

export function DocumentViewer({ documentId, courseId, sourceRef, onClose }: Props) {
  const source = sourceRef ? parseSourceReference(sourceRef) : undefined;
  const [document, setDocument] = useState<DocumentData>();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(source?.unitNumber ?? 1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(760);
  const [matchIndex, setMatchIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setDocument(undefined);
    setError("");
    requestJson<DocumentData>(sourceDocumentUrl(documentId, courseId))
      .then((value) => { if (active) setDocument(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load document."); });
    return () => { active = false; };
  }, [documentId, courseId]);

  useEffect(() => {
    if (source) setCurrentPage(source.unitNumber);
  }, [sourceRef]);

  useEffect(() => {
    const update = () => setContainerWidth(Math.max(280, Math.min(900, window.innerWidth - 100)));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const matches = useMemo<Match[]>(() => {
    return findDocumentMatches(document, query);
  }, [document, query]);

  useEffect(() => setMatchIndex(0), [query]);
  const activeMatch = matches[matchIndex];
  useEffect(() => {
    if (activeMatch) setCurrentPage(activeMatch.unitNumber);
  }, [activeMatch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const body = documentViewerBody();
      const marks = body?.querySelectorAll("mark");
      if (!marks?.length) return;
      const occurrence = activeMatch ? matches.slice(0, matchIndex).filter((match) => match.unitNumber === activeMatch.unitNumber).length : 0;
      marks[Math.min(occurrence, marks.length - 1)]?.scrollIntoView({ block: "center" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [activeMatch, matchIndex, matches]);

  const nextMatch = (direction: number) => {
    if (matches.length) setMatchIndex((index) => nextMatchIndex(index, direction, matches.length));
  };
  const highlight = (text: string) => {
    const trimmed = query.trim();
    if (!trimmed) return escapeHtml(text);
    const pattern = new RegExp("(" + escapeRegex(trimmed) + ")", "gi");
    return escapeHtml(text).replace(pattern, "<mark>$1</mark>");
  };
  const customTextRenderer = ({ str }: { str: string }) => highlight(str);
  const units = document?.units ?? [];
  const activeUnit = units.find((unit) => unit.number === currentPage) ?? units[0];
  const isPdf = document?.mimeType === "application/pdf";
  const isSlides = document?.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  return (
    <div className="di-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="di-viewer" role="dialog" aria-modal="true" aria-label={document?.title || "Document preview"}>
        <header className="di-viewer-header">
          <div className="di-viewer-heading"><span className="di-file-glyph">▤</span><div><strong>{document?.title || "Loading document…"}</strong><small>{document?.filename}</small></div></div>
          <button className="di-icon-button" onClick={onClose} aria-label="Close preview"><X size={18} /></button>
        </header>
        <div className="di-viewer-tools">
          <label className="di-view-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find in document" /><span>{matches.length ? (matchIndex + 1) + "/" + matches.length : query ? "0 matches" : ""}</span></label>
          <button className="di-tool-button" disabled={!matches.length} onClick={() => nextMatch(-1)} aria-label="Previous match"><ChevronLeft size={15} /></button>
          <button className="di-tool-button" disabled={!matches.length} onClick={() => nextMatch(1)} aria-label="Next match"><ChevronRight size={15} /></button>
          {isPdf && <><span className="di-tool-divider" /><button className="di-tool-button" onClick={() => setZoom((value) => Math.max(.55, value - .1))} aria-label="Zoom out"><Minus size={15} /></button><span className="di-zoom-label">{Math.round(zoom * 100)}%</span><button className="di-tool-button" onClick={() => setZoom((value) => Math.min(1.6, value + .1))} aria-label="Zoom in"><Plus size={15} /></button></>}
        </div>
        <div className="di-viewer-body" data-document-viewer-body>
          {error && <div className="di-error">{error}</div>}
          {!document && !error && <div className="di-loading">Opening document…</div>}
          {document && isPdf && <div className="di-pdf-canvas">
            <PdfDocument file={DOCUMENT_API + "/documents/" + encodeURIComponent(documentId) + "/file?course=" + encodeURIComponent(courseId)} onLoadSuccess={({ numPages }) => { setPageCount(numPages); setCurrentPage((page) => Math.min(page, numPages)); }} onLoadError={(reason) => setError(reason.message)} loading="Loading PDF…" error="Could not render this PDF.">
              <Page pageNumber={currentPage} width={Math.round(containerWidth * zoom)} renderTextLayer renderAnnotationLayer={false} customTextRenderer={customTextRenderer} />
            </PdfDocument>
          </div>}
          {document && !isPdf && activeUnit && <div className={"di-text-page" + (isSlides ? " di-slide-page" : "")}>
            {isSlides && <span className="di-slide-kicker">SLIDE {activeUnit.number}</span>}
            {activeUnit.title && <h2>{activeUnit.title}</h2>}
            <div className="di-readable-text" dangerouslySetInnerHTML={{ __html: highlight(activeUnit.text).replace(/\n/g, "<br />") }} />
          </div>}
          {document && !isPdf && !activeUnit && <div className="di-empty-preview">No readable text was extracted.</div>}
        </div>
        <footer className="di-viewer-footer">
          <span>{isPdf ? "Page " + currentPage + " of " + (pageCount || "—") : isSlides ? "Slide " + currentPage + " of " + units.length : units.length ? "Document text" : "No text"}</span>
          {(isPdf || isSlides) && <div className="di-page-controls"><button className="di-tool-button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button><input aria-label={isPdf ? "Page number" : "Slide number"} value={currentPage} onChange={(event) => setCurrentPage(document ? isPdf ? Math.max(1, Math.min(Number(event.target.value) || 1, pageCount || 1)) : clampUnitNumber(Number(event.target.value), "slide", document) : 1)} /><button className="di-tool-button" disabled={currentPage >= (isPdf ? pageCount : units.length)} onClick={() => setCurrentPage((page) => page + 1)} aria-label="Next page"><ChevronRight size={16} /></button></div>}
        </footer>
      </section>
    </div>
  );
}

function escapeRegex(value: string) { return value.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&"); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
function documentViewerBody() { return window.document.querySelector("[data-document-viewer-body]"); }
