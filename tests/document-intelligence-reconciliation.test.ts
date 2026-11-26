import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeDocumentIntelligenceSchema } from "../server/document-intelligence/schema.js";
import { deleteDocument, importDocuments } from "../server/document-intelligence/service.js";
import * as documentService from "../server/document-intelligence/service.js";

const unlinkState = vi.hoisted(() => ({ failFor: undefined as string | undefined }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    unlink: async (path: string | Buffer | URL) => {
      if (unlinkState.failFor && String(path) === unlinkState.failFor) {
        unlinkState.failFor = undefined;
        throw Object.assign(new Error("simulated unlink failure"), { code: "EPERM" });
      }
      return actual.unlink(path);
    },
  };
});

type Reconcile = (db: Database.Database, root: string, now?: number) => Promise<{ removedFiles: number; removedRows: number; removedUploads: number }>;
const reconcile = (documentService as unknown as { reconcileDocumentFiles?: Reconcile }).reconcileDocumentFiles;

const root = mkdtempSync(join(tmpdir(), "studyai-reconcile-"));
const storage = join(root, "files");
const db = new Database(join(root, "test.sqlite"));
db.exec("CREATE TABLE courses(id TEXT PRIMARY KEY, title TEXT, code TEXT, color TEXT)");
db.prepare("INSERT INTO courses VALUES(?,?,?,?)").run("chem-120", "Chemistry", "CHEM", "#fff");
const now = Date.now();

function writeOrphan(name: string): string {
  const path = join(storage, name);
  writeFileSync(path, "unreferenced import output");
  return path;
}

function makeUpload(id: string, ageMs: number): string {
  const dir = join(storage, ".uploads", id);
  mkdirSync(dir, { recursive: true });
  const part = join(dir, "0.part");
  writeFileSync(part, "partial");
  const old = new Date(now - ageMs);
  utimesSync(part, old, old);
  return dir;
}

beforeEach(() => {
  initializeDocumentIntelligenceSchema(db);
  db.exec("DELETE FROM di_chunks; DELETE FROM di_units; DELETE FROM di_documents;");
  rmSync(storage, { recursive: true, force: true });
  mkdirSync(storage, { recursive: true });
  unlinkState.failFor = undefined;
});

afterAll(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

describe("document file reconciliation", () => {
  it("exposes a reconciliation entry point", () => {
    expect(typeof reconcile).toBe("function");
  });

  it("removes a file left behind when an import dies after writing it, once", async () => {
    const orphan = writeOrphan(`${randomUUID()}.txt`);
    const unrelated = writeOrphan("my-notes.txt");
    const first = await reconcile!(db, storage, now);
    expect(first.removedFiles).toBe(1);
    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(unrelated)).toBe(true);
    const second = await reconcile!(db, storage, now);
    expect(second.removedFiles).toBe(0);
  });

  it("removes a file left behind when unlink failed after the row was deleted", async () => {
    const [imported] = await importDocuments(db, "chem-120", [{ name: "kept.txt", bytes: new TextEncoder().encode("Kept body.") }], storage);
    const row = db.prepare("SELECT storage_path FROM di_documents WHERE id=?").get(imported.id) as { storage_path: string };
    unlinkState.failFor = row.storage_path;
    expect(await deleteDocument(db, "chem-120", imported.id)).toBe(true);
    expect(existsSync(row.storage_path)).toBe(true);
    expect(db.prepare("SELECT 1 FROM di_documents WHERE id=?").get(imported.id)).toBeUndefined();
    const result = await reconcile!(db, storage, now);
    expect(result.removedFiles).toBe(1);
    expect(existsSync(row.storage_path)).toBe(false);
  });

  it("removes rows whose owned files are missing, once", async () => {
    const [imported] = await importDocuments(db, "chem-120", [{ name: "missing.txt", bytes: new TextEncoder().encode("Missing file.") }], storage);
    const row = db.prepare("SELECT storage_path FROM di_documents WHERE id=?").get(imported.id) as { storage_path: string };
    rmSync(row.storage_path);
    const first = await reconcile!(db, storage, now);
    expect(first.removedRows).toBe(1);
    expect(db.prepare("SELECT 1 FROM di_documents WHERE id=?").get(imported.id)).toBeUndefined();
    expect(db.prepare("SELECT 1 FROM di_units WHERE document_id=?").get(imported.id)).toBeUndefined();
    const second = await reconcile!(db, storage, now);
    expect(second.removedRows).toBe(0);
  });

  it.skipIf(process.platform !== "win32")("keeps valid files when the storage root spelling changes only by case", async () => {
    const [imported] = await importDocuments(db, "chem-120", [{ name: "case.txt", bytes: new TextEncoder().encode("Case matters.") }], storage);
    const row = db.prepare("SELECT storage_path FROM di_documents WHERE id=?").get(imported.id) as { storage_path: string };
    const alternate = row.storage_path.replace(/[A-Za-z]/g, (character) => character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase());
    db.prepare("UPDATE di_documents SET storage_path=? WHERE id=?").run(alternate, imported.id);
    const result = await reconcile!(db, storage, now);
    expect(result.removedFiles).toBe(0);
    expect(result.removedRows).toBe(0);
    expect(existsSync(row.storage_path)).toBe(true);
    expect(db.prepare("SELECT storage_path FROM di_documents WHERE id=?").get(imported.id)).toMatchObject({ storage_path: alternate });
  });

  it("keeps valid files when the configured root is a symlink or junction alias", async () => {
    const [imported] = await importDocuments(db, "chem-120", [{ name: "alias.txt", bytes: new TextEncoder().encode("Alias matters.") }], storage);
    const row = db.prepare("SELECT storage_path FROM di_documents WHERE id=?").get(imported.id) as { storage_path: string };
    const alias = join(root, "storage-alias");
    symlinkSync(storage, alias, process.platform === "win32" ? "junction" : "dir");
    try {
      const result = await reconcile!(db, alias, now);
      expect(result.removedFiles).toBe(0);
      expect(result.removedRows).toBe(0);
      expect(existsSync(row.storage_path)).toBe(true);
      expect(db.prepare("SELECT 1 FROM di_documents WHERE id=?").get(imported.id)).toBeDefined();
    } finally {
      rmSync(alias, { recursive: true, force: true });
    }
  });

  it("removes only aged incomplete upload parts", async () => {
    const aged = makeUpload(randomUUID(), 48 * 60 * 60 * 1000);
    const recent = makeUpload(randomUUID(), 60 * 1000);
    const unrelated = makeUpload("manual-folder", 48 * 60 * 60 * 1000);
    const first = await reconcile!(db, storage, now);
    expect(first.removedUploads).toBe(1);
    expect(existsSync(aged)).toBe(false);
    expect(existsSync(recent)).toBe(true);
    expect(existsSync(unrelated)).toBe(true);
    const second = await reconcile!(db, storage, now);
    expect(second.removedUploads).toBe(0);
  });

  it("moves orphaned UUID files into .trash instead of deleting them", async () => {
    const orphan = writeOrphan(`${randomUUID()}.txt`);
    const result = await reconcile!(db, storage, now);
    expect(result.removedFiles).toBe(1);
    expect(existsSync(orphan)).toBe(false);
    const trashed = join(storage, ".trash", basename(orphan));
    expect(existsSync(trashed)).toBe(true);
    expect(readFileSync(trashed, "utf8")).toBe("unreferenced import output");
  });

  it("keeps files and rows when the documents root is relocated", async () => {
    const [imported] = await importDocuments(db, "chem-120", [{ name: "moved.txt", bytes: new TextEncoder().encode("Moved body.") }], storage);
    const oldPath = (db.prepare("SELECT storage_path FROM di_documents WHERE id=?").get(imported.id) as { storage_path: string }).storage_path;
    const relocated = join(root, "relocated");
    mkdirSync(relocated, { recursive: true });
    const newPath = join(relocated, basename(oldPath));
    renameSync(oldPath, newPath);
    try {
      const result = await reconcile!(db, relocated, now);
      expect(result.removedFiles).toBe(0);
      expect(result.removedRows).toBe(0);
      expect(existsSync(newPath)).toBe(true);
      expect(db.prepare("SELECT storage_path FROM di_documents WHERE id=?").get(imported.id)).toMatchObject({ storage_path: newPath });
    } finally {
      rmSync(relocated, { recursive: true, force: true });
    }
  });

  it("skips destructive work when most rows have no file in the configured root", async () => {
    await importDocuments(db, "chem-120", ["a.txt", "b.txt", "c.txt"].map((name) => ({ name, bytes: new TextEncoder().encode(name) })), storage);
    expect(readdirSync(storage).filter((name) => name !== ".uploads")).toHaveLength(3);
    const empty = join(root, "empty-root");
    mkdirSync(empty, { recursive: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await reconcile!(db, empty, now)).toMatchObject({ removedFiles: 0, removedRows: 0, removedUploads: 0 });
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Reconciliation skipped/));
      expect(db.prepare("SELECT count(*) AS count FROM di_documents").get()).toMatchObject({ count: 3 });
      expect(readdirSync(storage).filter((name) => name !== ".uploads")).toHaveLength(3);
    } finally {
      warn.mockRestore();
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
