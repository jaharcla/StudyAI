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
import { initializeDocumentIntelligenceSchema } from "../server/document-intelligence/schema.js";
import { getDocumentLocation, importDocuments, makeSourceReference, parseSourceReference, searchDocuments } from "../server/document-intelligence/service.js";
import { docxFixture, pptxFixture } from "./fixtures/document-intelligence.js";
import { pdfFixture } from "./fixtures/document-intelligence.js";

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

  it("extracts PDF page text with one-based page metadata", async () => {
    const pdf = await extractDocument("sample.pdf", pdfFixture());
    expect(pdf.units).toEqual([{ type: "page", number: 1, text: "PDF sample page" }]);
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
    expect(imported.status).toBe(201);
    const search = await call("GET", "/api/document-intelligence/search?course=chem-120&q=nuclei");
    expect(search.status).toBe(200);
    expect(search.value.results).toHaveLength(1);
  });
});

afterAll(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
