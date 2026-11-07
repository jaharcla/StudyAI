# Document intelligence handoff

## Included

- User-triggerable bulk import service for PDF, DOCX, PPTX, and UTF-8 TXT, with a 20-file/50 MB batch limit and 20 MB per-file limit.
- PDF page, PowerPoint slide, and document-level text units; extraction metadata is stored with every unit and chunk.
- Overlapping text chunks, persistent SQLite FTS5 index, course-scoped lexical search, and stable source references in the form studyai://document/{id}/{page|slide|text}/{number}?chunk={index}.
- Original uploads are persisted under data/documents using generated filenames; the original filename/title remains metadata.
- Isolated fixtures and tests for TXT/DOCX/PPTX parsing, chunking, persistence, search isolation, source resolution, and invalid batches.

## Integration contract

server/document-intelligence/http.ts exports createDocumentIntelligenceHandler(db, storageRoot?), a Node request handler that returns true when it handles a request and false otherwise. The data API must call it before its 404 fallback. It serves:

- POST /api/document-intelligence/import JSON { "courseId": "chem-120", "files": [{ "name": "lecture.pdf", "contentBase64": "..." }] }.
- GET /api/document-intelligence/search?course=chem-120&q=... returning { results: [{ documentId, title, unitType, unitNumber, chunkIndex, sourceRef, excerpt, score }] }.
- GET /api/document-intelligence/source?course=chem-120&ref=studyai%3A%2F%2F... to resolve a citation to its unit/chunk text. The UI should navigate to unitType + unitNumber and open the returned excerpt.

The user interface must make the import explicit (file picker/drop only after user action), allow multiple files, and send course ID with the batch. The tutor/LangGraph must call course-scoped search and include returned sourceRef values with claims before the UI describes responses as grounded. Add citation rendering/navigation, connect retrieval to the graph, and verify an answer end-to-end before enabling grounded-answer language. This branch does not alter shared API, SQLite setup, CopilotKit, graph, or UI entrypoints.

## Isolated schema

initializeDocumentIntelligenceSchema creates di_documents, di_units, di_chunks, and di_chunk_search with insert/delete synchronization triggers. It is safe to call repeatedly and does not alter the existing documents, document_chunks, or chunk_search tables. Call it once when wiring the request handler or let the handler initialize on first use. Backups should include data/documents as well as SQLite.

## Dependencies and isolation

No package manifest or lockfile changes were made. PDF extraction imports pdfjs-dist, which is currently available transitively through react-pdf; make it a direct dependency when the stabilization branch is ready to update dependency manifests. Office ZIP reading and text extraction use Node built-ins. Because the supplied folder had no Git metadata, this work is in a standalone repository snapshot on branch work/document-intelligence with no shared commit ancestry. Integrate the changed files after stabilization rather than merging this snapshot repository.

## Limitations

- PDF is text extraction only: scanned pages, OCR, images, and tables are not interpreted. Empty pages are omitted from the index; cited page numbers remain the PDF's original one-based page number.
- DOCX text is stored as a document-level unit; pagination depends on a renderer and is not inferred. Tables contribute text in paragraph order.
- PPTX extracts slide text. Embedded media, notes, charts, and visual meaning are not extracted.
- Search is lexical FTS5; embeddings/reranking are not included. These results alone do not ground AI answers.
- Imports accept UTF-8 TXT only. ZIP packages are bounded by entry count and expanded-size caps; unsupported compression and encrypted Office files fail closed.
