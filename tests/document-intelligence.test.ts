import { afterAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chunkUnits } from "../server/document-intelligence/chunk.js";
import { extractDocument } from "../server/document-intelligence/extract.js";
import { createDocumentIntelligenceHandler } from "../server/document-intelligence/http.js";
import { createDocumentRetrievalTool } from "../server/document-intelligence/retrieval-tool.js";
import { initializeDocumentIntelligenceSchema } from "../server/document-intelligence/schema.js";
import { deleteDocument, getDocument, getDocumentFile, getDocumentLocation, importDocuments, importDocumentsIndividually, listDocuments, makeSourceReference, parseSourceReference, retrieveCourseDocuments, searchDocuments } from "../server/document-intelligence/service.js";
import { docxFixture, pptxFixture } from "./fixtures/document-intelligence.js";
import { pdfFixture } from "./fixtures/document-intelligence.js";
import { parseSourceReference as parseUiSourceReference } from "../src/components/document-intelligence/api.js";
import { clampUnitNumber, findDocumentMatches, nextMatchIndex } from "../src/components/document-intelligence/navigation.js";

const root = mkdtempSync(join(tmpdir(), "studyai-docintel-"));
const db = new Database(join(root, "test.sqlite"));
db.exec("CREATE TABLE courses(id TEXT PRIMARY KEY, title TEXT, code TEXT, color TEXT)");
db.prepare("INSERT INTO courses VALUES(?,?,?,?)").run("chem-120", "Chemistry", "CHEM", "#fff");
db.prepare("INSERT INTO courses VALUES(?,?,?,?)").run("biol-130", "Biology", "BIOL", "#fff");
const storage = join(root, "files");

describe("document intelligence", () => {
  beforeEach(() => {
    initializeDocumentIntelligenceSchema(db);
    db.exec("DELETE FROM di_chunks; DELETE FROM di_units; DELETE FROM di_documents;");
  });

  it("extracts UTF-8 text and DOCX paragraphs with title metadata", async () => {
    const text = await extractDocument("notes.TXT", new TextEncoder().encode("\uFEFFCell wall\r\n\r\nMade of cellulose."));
    expect(text.units[0]).toMatchObject({ type: "text", number: 1, text: "Cell wall\n\nMade of cellulose." });
    const docx = await extractDocument("ions.docx", docxFixture());
    expect(docx.title).toBe("Ion notes");
    expect(docx.units[0].text).toBe("Water & ions\nCharge stays conserved.");
  });

  it("titles imported documents by filename, not stale embedded metadata", async () => {
    // docxFixture() carries dc:title "Ion notes"; course decks often reuse a
    // stale slide-master title, so the uploaded filename must win in the library.
    const imported = await importDocuments(db, "chem-120", [{ name: "3.2 Dot Products.docx", bytes: docxFixture() }], storage);
    expect(imported[0].title).toBe("3.2 Dot Products.docx");
    expect(getDocument(db, "chem-120", imported[0].id)?.title).toBe("3.2 Dot Products.docx");
  });

  it("extracts PDF page text with one-based page metadata", async () => {
    const pdf = await extractDocument("sample.pdf", pdfFixture());
    expect(pdf.units).toEqual([{ type: "page", number: 1, text: "PDF sample page" }]);
  }, 15_000);

  it("reports scanned PDFs and empty documents as non-indexable instead of claiming OCR", async () => {
    await expect(extractDocument("scan.pdf", pdfFixture(""))).rejects.toThrow("No extractable text");
    await expect(extractDocument("empty.txt", new Uint8Array())).resolves.toMatchObject({ units: [{ text: "" }] });
    const results = await importDocumentsIndividually(db, "chem-120", [
      { name: "scan.pdf", bytes: pdfFixture("") },
      { name: "empty.txt", bytes: new Uint8Array() },
    ], storage);
    expect(results.map((item) => item.status)).toEqual(["error", "error"]);
  });

  it("preserves PPTX slide metadata and creates overlapping chunks", async () => {
    const deck = await extractDocument("lecture.pptx", pptxFixture());
    expect(deck.units).toEqual([{ type: "slide", number: 1, text: "Second slide" }, { type: "slide", number: 2, text: "First slide" }]);
    const chunks = chunkUnits([{ type: "page", number: 3, text: "alpha beta gamma delta epsilon zeta ".repeat(8) }], 100, 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].unitNumber).toBe(3);
    expect(chunks[0].content.slice(-10)).toContain(chunks[1].content.slice(0, 5));
  });

  it("persists a bulk batch, searches only its course, and resolves citation locations", async () => {
    const files = [
      { name: "ions.docx", bytes: docxFixture() },
      { name: "lecture.pptx", bytes: pptxFixture() },
      { name: "sample.pdf", bytes: pdfFixture() },
      { name: "review.txt", bytes: new TextEncoder().encode("Cell membrane transport uses ATP. It maintains concentration gradients.") },
    ];
    const imported = await importDocuments(db, "chem-120", files, storage);
    expect(imported).toHaveLength(4);
    const hits = searchDocuments(db, "chem-120", "conserved ions");
    expect(hits.length).toBeGreaterThan(0);
    expect(searchDocuments(db, "biol-130", "conserved ions")).toEqual([]);
    const reference = parseSourceReference(hits[0].sourceRef);
    expect(makeSourceReference(reference)).toBe(hits[0].sourceRef);
    expect(getDocumentLocation(db, hits[0].sourceRef, "chem-120")).toMatchObject({ documentId: hits[0].documentId, unitNumber: hits[0].unitNumber });
    expect(getDocumentLocation(db, hits[0].sourceRef, "biol-130")).toBeUndefined();
    expect(parseUiSourceReference(hits[0].sourceRef)).toMatchObject({ documentId: hits[0].documentId, unitNumber: hits[0].unitNumber });
    expect(retrieveCourseDocuments(db, "chem-120", "conserved").status).toBe("evidence");
    expect(retrieveCourseDocuments(db, "biol-130", "conserved")).toMatchObject({ status: "no_evidence", results: [] });
    expect(getDocument(db, "chem-120", hits[0].documentId)?.units).toHaveLength(1);
    expect(await getDocumentFile(db, "chem-120", hits[0].documentId)).toBeDefined();
    expect(listDocuments(db, "chem-120", "Ion").documents).toHaveLength(1);
    expect(listDocuments(db, "chem-120", "conserved").results.length).toBeGreaterThan(0);
  });

  it("returns per-file errors, detects duplicates, and deletes indexed documents", async () => {
    const bytes = new TextEncoder().encode("Stable duplicate content");
    const results = await importDocumentsIndividually(db, "chem-120", [
      { name: "first.txt", bytes },
      { name: "copy.txt", bytes },
      { name: "broken.docx", bytes: new Uint8Array([1, 2, 3]) },
    ], storage);
    expect(results.map((item) => item.status)).toEqual(["imported", "duplicate", "error"]);
    expect((await importDocumentsIndividually(db, "biol-130", [{ name: "same-content.txt", bytes }], storage))[0].status).toBe("imported");
    const indexed = results[0].status === "imported" ? results[0].document.id : "";
    expect(listDocuments(db, "chem-120").documents).toHaveLength(1);
    expect(await deleteDocument(db, "chem-120", indexed)).toBe(true);
    expect(listDocuments(db, "chem-120").documents).toHaveLength(0);
    expect(searchDocuments(db, "chem-120", "duplicate")).toEqual([]);
  });

  it("exposes a course-bound LangGraph retrieval tool with explicit no-evidence output", async () => {
    expect(() => createDocumentRetrievalTool(db, "not-a-course")).toThrow("unknown course");
    const tool = createDocumentRetrievalTool(db, "chem-120");
    const output = JSON.parse(String(await tool.invoke({ query: "evidence not present" })));
    expect(output).toMatchObject({ status: "no_evidence", courseId: "chem-120", results: [] });
    await importDocuments(db, "biol-130", [{ name: "biology.txt", bytes: new TextEncoder().encode("Mitochondria produce ATP.") }], storage);
    const stillEmpty = JSON.parse(String(await tool.invoke({ query: "mitochondria" })));
    expect(stillEmpty).toMatchObject({ status: "no_evidence", courseId: "chem-120", results: [] });
  });

  it("adds the hash column when upgrading the earlier isolated schema", () => {
    const legacy = new Database(":memory:");
    legacy.exec("CREATE TABLE di_documents(id TEXT PRIMARY KEY,course_id TEXT NOT NULL,title TEXT NOT NULL,filename TEXT NOT NULL,mime_type TEXT NOT NULL,storage_path TEXT NOT NULL,imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    initializeDocumentIntelligenceSchema(legacy);
    expect((legacy.pragma("table_info(di_documents)") as Array<{ name: string }>).some((column) => column.name === "content_hash")).toBe(true);
    legacy.close();
  });

  it("rejects invalid batches before writing any index rows", async () => {
    await expect(importDocuments(db, "chem-120", [
      { name: "valid.txt", bytes: new TextEncoder().encode("All or nothing") },
      { name: "bad.exe", bytes: new Uint8Array([1]) },
    ], storage)).rejects.toThrow("Supported formats");
    expect(db.prepare("SELECT count(*) AS count FROM di_documents").get()).toMatchObject({ count: 0 });
  });

  it("rejects malformed source references", () => {
    expect(() => parseSourceReference("https://example.com")).toThrow("Invalid document source reference");
  });

  it("navigates source search matches by page or slide and clamps manual locations", () => {
    const document = { id: "doc", courseId: "chem-120", title: "Deck", filename: "deck.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", importedAt: "", unitCount: 2, chunkCount: 2, units: [{ type: "slide" as const, number: 1, text: "ATP" }, { type: "slide" as const, number: 4, text: "ATP and cells" }] };
    expect(findDocumentMatches(document, "atp").map((match) => match.unitNumber)).toEqual([1, 4]);
    expect(nextMatchIndex(1, 1, 2)).toBe(0);
    expect(clampUnitNumber(9, "slide", document)).toBe(4);
  });

  it("imports large base64 payloads without a regex stack overflow", async () => {
    const handler = createDocumentIntelligenceHandler(db, storage);
    const bytes = Buffer.alloc(6 * 1024 * 1024, 65);
    const body = JSON.stringify({ courseId: "chem-120", files: [{ name: "large.txt", contentBase64: bytes.toString("base64") }] });
    const request = Readable.from([Buffer.from(body)]) as IncomingMessage;
    Object.assign(request, { method: "POST", url: "/api/document-intelligence/import", headers: { "content-length": String(Buffer.byteLength(body)) } });
    let status = 0;
    let value = "";
    const response = {
      writeHead(code: number) { status = code; return this; },
      end(content = "") { value = String(content); },
    } as unknown as ServerResponse;
    expect(await handler(request, response)).toBe(true);
    expect(status).toBe(200);
    expect(JSON.parse(value).documents[0].title).toBe("large.txt");
  }, 30_000);

  it("assembles a batched upload and indexes the file", async () => {
    const handler = createDocumentIntelligenceHandler(db, storage);
    const call = async (path: string, body: object) => {
      const payload = JSON.stringify(body);
      const request = Readable.from([Buffer.from(payload)]) as IncomingMessage;
      Object.assign(request, { method: "POST", url: "/api/document-intelligence" + path, headers: { "content-length": String(Buffer.byteLength(payload)) } });
      let status = 0;
      let value = "";
      const response = {
        writeHead(code: number) { status = code; return this; },
        end(content = "") { value = String(content); },
      } as unknown as ServerResponse;
      expect(await handler(request, response)).toBe(true);
      return { status, value: JSON.parse(value) as { documents?: Array<{ title: string }>; results?: Array<{ status: string }>; error?: string } };
    };
    const bytes = Buffer.alloc(5 * 1024 * 1024, 65);
    const uploadId = "11111111-2222-4333-8444-555555555555";
    const chunkSize = 2 * 1024 * 1024;
    for (let index = 0, offset = 0; offset < bytes.length; index++, offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
      const result = await call("/upload/chunk", { uploadId, courseId: "chem-120", name: "batched.txt", chunkIndex: index, contentBase64: chunk.toString("base64") });
      expect(result.status, JSON.stringify(result.value)).toBe(200);
    }
    const complete = await call("/upload/complete", { uploadId, courseId: "chem-120", name: "batched.txt", totalChunks: Math.ceil(bytes.length / chunkSize) });
    expect(complete.status).toBe(200);
    expect(complete.value.documents?.[0]?.title).toBe("batched.txt");
    expect(complete.value.results?.[0]?.status).toBe("imported");
  }, 30_000);

  it("rejects completing a batch with missing chunks", async () => {
    const handler = createDocumentIntelligenceHandler(db, storage);
    const payload = JSON.stringify({ uploadId: "99999999-2222-4333-8444-555555555555", courseId: "chem-120", name: "partial.txt", totalChunks: 2 });
    const request = Readable.from([Buffer.from(payload)]) as IncomingMessage;
    Object.assign(request, { method: "POST", url: "/api/document-intelligence/upload/complete", headers: { "content-length": String(Buffer.byteLength(payload)) } });
    let status = 0;
    let value = "";
    const response = {
      writeHead(code: number) { status = code; return this; },
      end(content = "") { value = String(content); },
    } as unknown as ServerResponse;
    expect(await handler(request, response)).toBe(true);
    expect(status).toBe(400);
    expect(JSON.parse(value).error).toMatch(/upload|chunk/i);
  });

  it("serves explicit bulk import and course search through the HTTP adapter", async () => {
    const handler = createDocumentIntelligenceHandler(db, storage);
    const call = async (method: string, url: string, body = "") => {
      const request = Readable.from(body ? [Buffer.from(body)] : []) as IncomingMessage;
      Object.assign(request, { method, url, headers: { "content-length": String(Buffer.byteLength(body)) } });
      let status = 0;
      let value = "";
      const response = {
        writeHead(code: number) { status = code; return this; },
        end(content = "") { value = String(content); },
      } as unknown as ServerResponse;
      expect(await handler(request, response)).toBe(true);
      return { status, value: JSON.parse(value) };
    };
    const imported = await call("POST", "/api/document-intelligence/import", JSON.stringify({ courseId: "chem-120", files: [{ name: "route.txt", contentBase64: Buffer.from("Course scoped nuclei").toString("base64") }] }));
    expect(imported.status).toBe(200);
    const documentId = imported.value.documents[0].id as string;
    const search = await call("GET", "/api/document-intelligence/search?course=chem-120&q=nuclei");
    expect(search.status).toBe(200);
    expect(search.value.results).toHaveLength(1);
    expect((await call("GET", "/api/document-intelligence/documents?course=chem-120")).value.documents).toHaveLength(1);
    expect((await call("GET", "/api/document-intelligence/documents/" + documentId + "?course=chem-120")).value.filename).toBe("route.txt");
    expect((await call("GET", "/api/document-intelligence/source?course=chem-120&ref=" + encodeURIComponent(search.value.results[0].sourceRef))).status).toBe(200);
    expect((await call("DELETE", "/api/document-intelligence/documents/" + documentId + "?course=chem-120")).status).toBe(200);
  });
});

afterAll(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
