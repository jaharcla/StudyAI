export const DOCUMENT_API = "/api/document-intelligence";

export type UnitType = "page" | "slide" | "text";
export type SourceReference = { documentId: string; unitType: UnitType; unitNumber: number; chunkIndex: number };
export type SearchHit = { documentId: string; title: string; filename: string; unitType: UnitType; unitNumber: number; chunkIndex: number; sourceRef: string; excerpt: string; score: number };
export type LibraryDocument = { id: string; courseId: string; lessonId?: string | null; title: string; filename: string; mimeType: string; importedAt: string; unitCount: number; chunkCount: number };
export type DocumentData = LibraryDocument & { units: Array<{ type: UnitType; number: number; title?: string; text: string }> };

export function parseSourceReference(sourceRef: string): SourceReference | undefined {
  const match = sourceRef.match(/^studyai:\/\/document\/([^/]+)\/(page|slide|text)\/(\d+)\?chunk=(\d+)$/);
  if (!match) return undefined;
  try {
    return { documentId: decodeURIComponent(match[1]), unitType: match[2] as UnitType, unitNumber: Number(match[3]), chunkIndex: Number(match[4]) };
  } catch { return undefined; }
}

export function sourceDocumentUrl(documentId: string, courseId: string, file = false): string {
  const path = DOCUMENT_API + "/documents/" + encodeURIComponent(documentId) + (file ? "/file" : "");
  return path + "?course=" + encodeURIComponent(courseId);
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const value = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(value.error || "Document service request failed.");
  return value;
}

export const BATCH_UPLOAD_THRESHOLD_BYTES = 4 * 1024 * 1024;
export const BATCH_CHUNK_BYTES = 2 * 1024 * 1024;

type UploadResult = { status: "imported" | "duplicate" | "error"; message: string; documentId?: string };
type ImportResponse = { results?: Array<{ status: UploadResult["status"]; fileName: string; error?: string; document?: { id: string; title: string } }>; error?: string };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function describe(result: NonNullable<ImportResponse["results"]>[number]): UploadResult {
  return {
    status: result.status,
    message: result.status === "error" ? (result.error || "Import failed.") : result.status === "duplicate" ? "Already imported as " + result.document?.title + "." : "Indexed",
    documentId: result.document?.id,
  };
}

function uploadSingle(file: File, courseId: string, onProgress: (value: number) => void, lessonId?: string): Promise<UploadResult> {
  return new Promise((resolve) => {
    void (async () => {
      try {
        const body = JSON.stringify({ courseId, lessonId, files: [{ name: file.name, contentBase64: toBase64(new Uint8Array(await file.arrayBuffer())) }] });
        const xhr = new XMLHttpRequest();
        xhr.open("POST", DOCUMENT_API + "/import");
        xhr.setRequestHeader("content-type", "application/json");
        xhr.upload.onprogress = (event) => onProgress(event.lengthComputable ? Math.round(event.loaded / event.total * 100) : 0);
        xhr.onerror = () => resolve({ status: "error", message: "Network error while uploading." });
        xhr.onload = () => {
          try {
            const response = JSON.parse(xhr.responseText) as ImportResponse;
            const result = response.results?.[0];
            if (xhr.status < 200 || xhr.status >= 300 || !result) return resolve({ status: "error", message: response.error || "Import failed." });
            resolve(describe(result));
          } catch { resolve({ status: "error", message: "Invalid response from document service." }); }
        };
        xhr.send(body);
      } catch (error) { resolve({ status: "error", message: error instanceof Error ? error.message : "Could not read file." }); }
    })();
  });
}

async function uploadBatched(file: File, courseId: string, onProgress: (value: number) => void, lessonId?: string): Promise<UploadResult> {
  const uploadId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / BATCH_CHUNK_BYTES);
  const common = { uploadId, courseId, ...(lessonId ? { lessonId } : {}), name: file.name };
  const headers = { "content-type": "application/json" };
  for (let index = 0; index < totalChunks; index++) {
    const start = index * BATCH_CHUNK_BYTES;
    const slice = new Uint8Array(await file.slice(start, start + BATCH_CHUNK_BYTES).arrayBuffer());
    await requestJson(DOCUMENT_API + "/upload/chunk", { method: "POST", headers, body: JSON.stringify({ ...common, chunkIndex: index, contentBase64: toBase64(slice) }) });
    onProgress(Math.round(((index + 1) / totalChunks) * 100));
  }
  const response = await requestJson<ImportResponse>(DOCUMENT_API + "/upload/complete", { method: "POST", headers, body: JSON.stringify({ ...common, totalChunks }) });
  const result = response.results?.[0];
  if (!result) return { status: "error", message: response.error || "Import failed." };
  return describe(result);
}

export async function uploadOne(file: File, courseId: string, onProgress: (value: number) => void, lessonId?: string): Promise<UploadResult> {
  try {
    return file.size > BATCH_UPLOAD_THRESHOLD_BYTES
      ? await uploadBatched(file, courseId, onProgress, lessonId)
      : await uploadSingle(file, courseId, onProgress, lessonId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not read file." };
  }
}
