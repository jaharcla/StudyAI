import { buildTutorEvidenceContract, groundingNotice } from "../../../server/tutor-evidence-contract.js";
import type { TutorLLM, TutorTurnInput } from "../types.js";

export interface OllamaTutorOptions {
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
}

/**
 * The same local Tutor model the app uses, reached through Ollama's streaming
 * chat endpoint. No OpenAI or Gemini dependency and no key is read or stored.
 * The evidence contract is rebuilt with the real frozen helper; with no
 * excerpts supplied it honestly reports "No course evidence".
 */
export function createOllamaTutor(options: OllamaTutorOptions = {}): TutorLLM {
  const baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:latest";
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async *stream(input: TutorTurnInput): AsyncIterable<string> {
      const notice = groundingNotice(buildTutorEvidenceContract({
        evidence: null,
        dropped: false,
        sourceRefs: input.sourceRefs,
      })) ?? "";
      const system = [
        "You are the StudyAI Tutor answering a student about their own course material.",
        "Answer only from course excerpts included in the conversation. If none are present, say you need the course material. Never invent facts, citations, confidence numbers or answers.",
        notice,
      ].filter(Boolean).join(" ");
      const response = await fetchFn(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            { role: "system", content: system },
            ...input.history.map((entry) => ({ role: entry.role === "student" ? "user" : "assistant", content: entry.text })),
            { role: "user", content: input.text },
          ],
          options: { temperature: 0.2 },
        }),
        signal: input.signal,
      });
      if (!response.ok || !response.body) throw new Error(`Local tutor unavailable (HTTP ${response.status}).`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line) as { message?: { content?: string } };
          const content = parsed.message?.content;
          if (content) yield content;
        }
      }
    },
  };
}
