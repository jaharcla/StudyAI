# Document intelligence

The integrated document subsystem is implemented in `server/document-intelligence` and `src/components/document-intelligence`. It imports files into the active course, extracts indexable text, provides lexical search and Tutor retrieval, and resolves citations to their source units.

## Supported files

- PDF: text extracted per page, up to 2,000 pages.
- DOCX: paragraph text from the document XML.
- PPTX: text from slides in presentation order.
- TXT: valid UTF-8 text.

Imports are limited to 20 files and 50 MB per batch, with a 20 MB per-file limit. Office archives are bounded to 2,000 entries and 80 MB expanded content. Scanned PDFs are not OCR'd. Embedded images, visual meaning, and presentation notes are not extracted.

## Storage and retrieval

Original files default to `data/documents/`. Metadata and extracted units are stored in `di_documents` and `di_units`; retrievable chunks are in `di_chunks`, indexed by the FTS5 table `di_chunk_search` (external content over `di_chunks`, kept in sync by the `di_chunks_ai` and `di_chunks_ad` triggers). The schema is created by `initializeDocumentIntelligenceSchema` in `server/document-intelligence/schema.ts`, which the data API calls at startup (`server/api.ts`); a database that has not run the data API since this subsystem landed will not have the `di_*` tables yet. SQLite FTS5 provides course-scoped lexical search with the `unicode61` tokenizer; the system does not use embeddings or reranking.

The Tutor receives candidate excerpts from the active course when retrieval is relevant. Source references identify a document, page/slide/text unit, and chunk. A citation identifies where text came from; it does not verify the answer's scientific correctness.

The UI and HTTP handler are in `src/components/document-intelligence` and `server/document-intelligence/http.ts`. Routes include:

- `POST /api/document-intelligence/import`
- `GET /api/document-intelligence/search?course=…&q=…`
- `GET /api/document-intelligence/retrieve?course=…&q=…`
- `GET /api/document-intelligence/documents?course=…`
- `GET /api/document-intelligence/source?course=…&ref=…`

The document handler also supports reading and deleting a course-scoped document and serving its original file. Legacy TXT documents remain supported by the older API and are indexed for retrieval there, using a separate table family: `documents`, `document_chunks`, and the `chunk_search` FTS5 table.
