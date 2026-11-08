export type ModelStatus = { provider: "Ollama"; connected: boolean; models: Array<{ name: string; size: number }>; configuredModel: string; error?: string };

export async function getModelStatus(baseUrl: string, configuredModel: string, fetcher: typeof fetch = fetch): Promise<{ status: number; body: ModelStatus }> {
  try {
    const response = await fetcher(`${baseUrl}/api/tags`);
    if (!response.ok) return { status: 502, body: { provider: "Ollama", connected: false, models: [], configuredModel, error: `Ollama returned ${response.status}` } };
    const data = await response.json() as { models?: Array<{ name: string; size: number }> };
    return { status: 200, body: { provider: "Ollama", connected: true, models: data.models ?? [], configuredModel } };
  } catch {
    return { status: 503, body: { provider: "Ollama", connected: false, models: [], configuredModel, error: "Ollama is unavailable" } };
  }
}
