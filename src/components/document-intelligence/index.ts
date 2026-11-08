import "./document-intelligence.css";

export { Citation, CitationList } from "./Citation.js";
export type { CitationItem } from "./Citation.js";
export { DocumentLibrary } from "./DocumentLibrary.js";
export { DocumentViewer } from "./DocumentViewer.js";
export { clampUnitNumber, findDocumentMatches, nextMatchIndex } from "./navigation.js";
export type { DocumentData, LibraryDocument, SearchHit, SourceReference, UnitType } from "./api.js";
export { parseSourceReference, sourceDocumentUrl } from "./api.js";
