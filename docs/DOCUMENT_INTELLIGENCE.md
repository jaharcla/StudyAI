# Document intelligence handoff

## Included

- User-triggerable bulk import service for PDF, DOCX, PPTX, and UTF-8 TXT, with a 20-file/50 MB batch limit and 20 MB per-file limit.
- Responsive library, drag-and-drop/file-picker import, per-file progress/errors, course scope, duplicate status, title/text search, preview, and confirmed deletion under src/components/document-intelligence/.
- PDF page navigation/zoom and text-layer highlights; PPTX slide navigation; extracted DOCX/TXT previews; in-document match navigation and reusable Citation/CitationList components.
- PDF page, PowerPoint slide, and document-level text units; extraction metadata is stored with every unit and chunk.
- Overlapping text chunks, persistent SQLite FTS5 index, course-scoped lexical search, SHA-256 duplicate detection per course, and stable source references in the form studyai://document/{id}/{page|slide|text}/{number}?chunk={index}.
- Original uploads are persisted under data/documents using generated filenames; the original filename/title remains metadata.
- A course-bound LangGraph tool factory in server/document-intelligence/retrieval-tool.ts. It returns candidate evidence or explicit no_evidence, and its description warns against treating excerpts as verified answers or inventing citations.
- Isolated fixture tests for extraction, scanned/empty documents, duplicate and per-file errors, search isolation, citation/source resolution, document navigation, deletion, schema migration, and the HTTP adapter.

## Integration contract

server/document-intelligence/http.ts exports createDocumentIntelligenceHandler(db, storageRoot?), a Node request handler that returns true when it handles a request and false otherwise. The data API must call it before its 404 fallback. It serves:

- POST /api/document-intelligence/import with JSON { "courseId": "chem-120", "files": [{ "name": "lecture.pdf", "contentBase64": "..." }] }. It returns a per-file results list with imported, duplicate, or error status.
- GET /api/document-intelligence/documents?course=chem-120&q=... lists course documents and matching source excerpts.
- GET /api/document-intelligence/documents/{id}?course=chem-120 returns metadata and extracted units; DELETE on the same URL removes the document and its FTS entries.
- GET /api/document-intelligence/documents/{id}/file?course=chem-120 streams the original file for the PDF viewer.
- GET /api/document-intelligence/search?course=chem-120&q=... returns lexical hits with documentId, title, unitType, unitNumber, chunkIndex, sourceRef, excerpt, and score.
- GET /api/document-intelligence/source?course=chem-120&ref=studyai%3A%2F%2F... resolves a citation to its unit/chunk text.
- GET /api/document-intelligence/retrieve?course=chem-120&q=... returns evidence or no_evidence. The LangGraph tool factory accepts a Database and a server-bound course ID and only takes a query from the model.

Example data API wiring, after stabilization:

    const documentHandler = createDocumentIntelligenceHandler(db);
    if (await documentHandler(req, res)) return;

Mount the UI by importing DocumentLibrary from src/components/document-intelligence and passing the active course ID (and optional courses/onCourseChange props). Citation and CitationList accept an onOpen callback; connect it to DocumentLibrary's initialSourceRef or the application's document route. Bind createDocumentRetrievalTool(db, trustedActiveCourseId) to the graph/tool set. Do not let the model choose or override the course ID. Include returned sourceRef values in tutor output, render them with Citation, and verify answers end-to-end before using source-grounded language. These entrypoints remain untouched in this branch.

## Isolated schema

initializeDocumentIntelligenceSchema creates di_documents, di_units, di_chunks, and di_chunk_search with insert/delete synchronization triggers. It is safe to call repeatedly and does not alter the existing documents, document_chunks, or chunk_search tables. Call it once when wiring the request handler or let the handler initialize on first use. Backups should include data/documents as well as SQLite.

## Dependencies and isolation

No package manifest or lockfile changes were made. The viewer and PDF extraction require react-pdf and pdfjs-dist; pdfjs-dist is currently available transitively through react-pdf, so make it a direct dependency when dependency manifests can be updated. Office ZIP reading and text extraction use Node built-ins. Because the supplied folder had no Git metadata, this work is in a standalone repository snapshot on branch work/document-intelligence with no shared commit ancestry. Integrate the changed files after stabilization rather than merging this snapshot repository.

## Verification

Verified in this worktree: all 15 Vitest cases pass and TypeScript checking passes. Browser rendering, the production PDF worker bundle, integration into the shared data API/React entrypoint, and graph end-to-end behavior remain unverified.

## Limitations

- PDF is text extraction only: scanned pages, OCR, images, and tables are not interpreted. Empty pages are omitted from the index; cited page numbers remain the PDF's original one-based page number.
- DOCX text is stored as a document-level unit; pagination depends on a renderer and is not inferred. Tables contribute text in paragraph order.
- PPTX extracts slide text. Embedded media, notes, charts, and visual meaning are not extracted.
- Search is lexical FTS5; embeddings/reranking are not included. These results alone do not ground AI answers.
- Imports accept UTF-8 TXT only. ZIP packages are bounded by entry count and expanded-size caps; unsupported compression and encrypted Office files fail closed.
