export const DOCUMENT_API = "http://127.0.0.1:8201/api/document-intelligence";

export type UnitType = "page" | "slide" | "text";
export type SourceReference = { documentId: string; unitType: UnitType; unitNumber: number; chunkIndex: number };
export type SearchHit = { documentId: string; title: string; unitType: UnitType; unitNumber: number; chunkIndex: number; sourceRef: string; excerpt: string; score: number };
export type LibraryDocument = { id: string; courseId: string; title: string; filename: string; mimeType: string; importedAt: string; unitCount: number; chunkCount: number };
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

export function uploadOne(file: File, courseId: string, onProgress: (value: number) => void): Promise<{ status: "imported" | "duplicate" | "error"; message: string; documentId?: string }> {
  return new Promise(async (resolve) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      const body = JSON.stringify({ courseId, files: [{ name: file.name, contentBase64: btoa(binary) }] });
      const xhr = new XMLHttpRequest();
      xhr.open("POST", DOCUMENT_API + "/import");
      xhr.setRequestHeader("content-type", "application/json");
      xhr.upload.onprogress = (event) => onProgress(event.lengthComputable ? Math.round(event.loaded / event.total * 100) : 0);
      xhr.onerror = () => resolve({ status: "error", message: "Network error while uploading." });
      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.responseText) as { results?: Array<{ status: "imported" | "duplicate" | "error"; fileName: string; error?: string; document?: { id: string; title: string } }>; error?: string };
          const result = response.results?.[0];
          if (xhr.status < 200 || xhr.status >= 300 || !result) return resolve({ status: "error", message: response.error || "Import failed." });
          resolve({ status: result.status, message: result.status === "error" ? (result.error || "Import failed.") : result.status === "duplicate" ? "Already imported as " + result.document?.title + "." : "Indexed", documentId: result.document?.id });
        } catch { resolve({ status: "error", message: "Invalid response from document service." }); }
      };
      xhr.send(body);
    } catch (error) { resolve({ status: "error", message: error instanceof Error ? error.message : "Could not read file." }); }
  });
}
