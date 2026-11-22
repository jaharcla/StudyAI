export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  // The brief forces stream to be false; callers may omit this.
  stream?: boolean;
}

export interface ChatResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Calls the Groq non‑streaming chat completion endpoint.
 *
 * @param req   The chat request payload (model and messages).
 * @param apiKey The Groq API key – supplied by the Worker at runtime.
 * @param fetchImpl Optional fetch implementation – defaults to the global fetch.
 *
 * The request is POSTed to https://api.groq.com/openai/v1/chat/completions with
 * the `Authorization: Bearer <apiKey>` and `Content-Type: application/json`
 * headers. The body is the request JSON with `stream: false` forced.
 *
 * On success the function extracts the assistant message content and token usage
 * from the JSON response and returns them. On any non‑OK HTTP status an Error is
 * thrown whose message contains the status code.
 */
export async function callGroq(
  req: ChatRequest,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatResult> {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const body = {
    ...req,
    // The brief explicitly requires non‑streaming calls.
    stream: false,
  };

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Groq request failed with status ${response.status}`);
  }

  // The response shape follows OpenAI's chat completion format.
  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  const text = data.choices?.[0]?.message?.content ?? "";
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;

  return { text, promptTokens, completionTokens };
}
