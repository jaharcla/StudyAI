import type { MouseEvent } from "react";
import { ArrowUpRight, FileText } from "lucide-react";
import { parseSourceReference } from "./api.js";

export type CitationItem = { sourceRef: string; title?: string; excerpt?: string };

export function Citation({ sourceRef, title, onOpen, compact = false }: CitationItem & { onOpen?: (sourceRef: string) => void; compact?: boolean }) {
  const source = parseSourceReference(sourceRef);
  if (!source) return <span className="di-citation-invalid">Invalid source reference</span>;
  const location = source.unitType === "page" ? "p. " + source.unitNumber : source.unitType === "slide" ? "slide " + source.unitNumber : "text";
  const activate = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onOpen?.(sourceRef);
  };
  return (
    <button className={"di-citation" + (compact ? " di-citation-compact" : "")} type="button" title={sourceRef} onClick={activate}>
      <FileText size={13} />
      <span>{title || "Source"} · {location}</span>
      <ArrowUpRight size={12} />
    </button>
  );
}

export function CitationList({ citations, onOpen }: { citations: CitationItem[]; onOpen?: (sourceRef: string) => void }) {
  if (!citations.length) return null;
  return <div className="di-citation-list">{citations.map((item) => <Citation key={item.sourceRef} {...item} onOpen={onOpen} />)}</div>;
}
