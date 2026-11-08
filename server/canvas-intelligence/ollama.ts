import { z } from "zod";

type OllamaChatOptions = { baseUrl?: string; model: string; system: string; prompt: string; image?: string; signal?: AbortSignal; timeoutMs?: number; fetcher?: typeof fetch };
const TagsSchema = z.object({ models: z.array(z.object({ name: z.string() }).passthrough()).default([]) });

export async function ollamaJson<T>(options: OllamaChatOptions, schema: z.ZodType<T>, normalize?: (value: unknown, raw: string) => unknown): Promise<T> {
  const content = await ollamaContent(options, schema);
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error(`Ollama ${options.model} returned invalid JSON`); }
  return schema.parse(normalize ? normalize(parsed, content) : parsed);
}

export async function ollamaText(options: OllamaChatOptions): Promise<string> {
  return ollamaContent(options);
}

async function ollamaContent(options: OllamaChatOptions, schema?: z.ZodType): Promise<string> {
  const baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? Number(process.env.CANVAS_MODEL_TIMEOUT_MS || 90_000);
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)].filter((s): s is AbortSignal => !!s));
  let tags: z.infer<typeof TagsSchema>;
  try {
    const response = await fetcher(`${baseUrl}/api/tags`, { signal });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    tags = TagsSchema.parse(await response.json());
  } catch (error) { throw new Error(`Cannot check Ollama models at ${baseUrl}: ${error instanceof Error ? error.message : "request failed"}`); }
  if (!tags.models.some(({ name }) => name === options.model)) throw new Error(`Required Ollama model is not installed: ${options.model}. Install it or set the matching canvas model configuration.`);
  const userMessage: { role: "user"; content: string; images?: string[] } = { role: "user", content: options.prompt };
  if (options.image) userMessage.images = [options.image.replace(/^data:image\/[^;]+;base64,/, "")];
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: options.model, stream: false, ...(schema ? { format: z.toJSONSchema(schema, { io: "input" }) } : {}), messages: [{ role: "system", content: options.system }, userMessage], options: { temperature: 0 } }), signal });
  } catch (error) { throw new Error(`Ollama ${options.model} inference failed: ${error instanceof Error ? error.message : "request failed"}`); }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Ollama ${options.model} inference failed with status ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const envelope = z.object({ message: z.object({ content: z.string() }) }).parse(await response.json());
  return envelope.message.content;
}
