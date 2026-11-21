# ADR: Batched upload for large course documents

Status: accepted for implementation.

## Decision

Document imports over 4 MB use a batched upload protocol instead of one base64 JSON request:

1. `POST /api/document-intelligence/upload/chunk` writes one ≤3 MB base64 slice to a session directory under `data/documents/.uploads/<uploadId>/`.
2. `POST /api/document-intelligence/upload/complete` verifies every chunk is present, concatenates them, and reuses the existing `importDocumentsIndividually` pipeline unchanged.

Files ≤4 MB keep the existing single-request `/api/document-intelligence/import` path. The client picks the path by `file.size` (`BATCH_UPLOAD_THRESHOLD_BYTES = 4 MiB`, `BATCH_CHUNK_BYTES = 2 MiB`).

## Reasons

- A single large base64 JSON body peaked at ~16 MB of strings and buffers. The old validation regex (nested quantifier) overflowed V8's stack above ~8 MB of base64, which is why 6–12 MB PPTX/PDF files failed. The regex was replaced with a linear round-trip check, but one huge request is still memory-heavy.
- Chunking bounds each request to ~2.7 MB of base64 and lets the existing extraction, FTS indexing and per-file error handling stay authoritative — no second import authority is introduced.
- No new dependency: the existing `/api/document-intelligence` handler, dotenv-free local storage and `ImportFile` type are reused.

## Limits

- Upload sessions are identified by a strict UUID; chunk indexes are bounded (0–63) and chunk bytes by 3 MiB. Completed and failed sessions are removed in `finally`.
- Orphaned sessions from a hard crash are not reaped automatically; they live under `.uploads/` and can be deleted manually.
- The 20 MB per-file and 50 MB batch caps from the import service still apply.
- The client reports progress per completed chunk rather than per byte.

## Verification

- Unit tests: assemble a 5 MB upload from 3 chunks and index it; reject completion with missing chunks; keep the existing large single-request import test.
- Browser: upload a previously failing 6.3 MB PPTX and confirm "Indexed" in Recent imports.
- `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`.
