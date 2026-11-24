import { z } from "zod";
import type { PresentonGenerateRequest } from "./compile";

export type RenderedDeck = {
  presentationId: string;
  pptxPath: string;
  editPath: string;
};

export type RendererDeps = {
  fetch: typeof fetch;
  baseUrl: string;
  apiKey: string;
};

/** A missing optional local service is a deterministic setup issue, not a transient busy server. */
export class PresentationRendererUnavailable extends Error {
  constructor() {
    super("The local presentation service (Presenton) is not available.");
    this.name = "PresentationRendererUnavailable";
  }
}

const responseSchema = z.object({
  presentation_id: z.string().min(1).max(200),
  path: z.string().min(1).max(1000),
  edit_path: z.string().max(1000),
}).strict();

function safePptxPath(raw: string): string {
  const stripped = raw.replace(/^\/app_data\//, "");
  if (!stripped || stripped.includes("..") || stripped.includes("\\") || stripped.startsWith("/") || /^[A-Za-z]:/.test(stripped)) {
    throw new Error("unsafe Presenton path");
  }
  return stripped;
}

/** Calls a self-hosted Presenton over loopback. The key is used in the header only and never logged. */
export async function renderPresentonDeck(request: PresentonGenerateRequest, deps: RendererDeps): Promise<RenderedDeck> {
  let response: Response;
  try {
    response = await deps.fetch(`${deps.baseUrl.replace(/\/$/, "")}/api/v1/ppt/presentation/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${deps.apiKey}` },
      body: JSON.stringify(request),
    });
  } catch {
    throw new PresentationRendererUnavailable();
  }
  if (response.status === 503 || response.status === 404) throw new PresentationRendererUnavailable();
  if (!response.ok) throw new Error(`Presenton generation failed (${response.status})`);
  const parsed = responseSchema.parse(await response.json());
  return {
    presentationId: parsed.presentation_id,
    pptxPath: safePptxPath(parsed.path),
    editPath: parsed.edit_path,
  };
}
