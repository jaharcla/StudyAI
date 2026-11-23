export type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ToolCall = { name: string; arguments: Record<string, unknown> };

export type ChatResult = {
  content: string;
  thinking: string;
  toolCalls: ToolCall[];
  promptTokens: number;
  completionTokens: number;
  durationNs: number;
  attempts: number;
};

type OllamaResponse = {
  message?: {
    content?: string;
    thinking?: string;
    tool_calls?: Array<{
      function?: { name?: string; arguments?: unknown };
    }>;
  };
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
};

function isResponse(value: unknown): value is OllamaResponse {
  return typeof value === "object" && value !== null;
}

export async function chat(
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  retries = 4
): Promise<ChatResult> {
  let lastError = "";
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages,
        tools: tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
      continue;
    }
    const parsed: unknown = JSON.parse(text);
    if (!isResponse(parsed)) {
      lastError = "unparseable response";
      continue;
    }
    const toolCalls: ToolCall[] = (parsed.message?.tool_calls ?? []).flatMap(
      (call) => {
        const name = call.function?.name;
        if (!name) return [];
        const args = call.function?.arguments;
        return [
          {
            name,
            arguments:
              typeof args === "object" && args !== null
                ? (args as Record<string, unknown>)
                : {},
          },
        ];
      }
    );
    return {
      content: parsed.message?.content ?? "",
      thinking: parsed.message?.thinking ?? "",
      toolCalls,
      promptTokens: parsed.prompt_eval_count ?? 0,
      completionTokens: parsed.eval_count ?? 0,
      durationNs: parsed.total_duration ?? 0,
      attempts: attempt,
    };
  }
  throw new Error(`Ollama chat failed after ${retries} attempts: ${lastError}`);
}
