import { describe, expect, test, vi } from 'vitest';
import { costMicros } from '../src/pricing.js';
import { callGroq, type ChatRequest, type ChatMessage } from '../src/groq.js';

// @ts-expect-error invalid role should be rejected
const _invalidChatMessage: ChatMessage = { role: 'invalid', content: 'oops' };

describe('pricing.costMicros', () => {
  test('input rate for 1M tokens', () => {
    expect(costMicros('openai/gpt-oss-120b', 1_000_000, 0)).toBe(150_000);
  });

  test('output rate for 1M tokens', () => {
    expect(costMicros('openai/gpt-oss-120b', 0, 1_000_000)).toBe(600_000);
  });

  test('zero usage yields zero cost', () => {
    expect(costMicros('openai/gpt-oss-120b', 0, 0)).toBe(0);
  });

  test('partial millions round up', () => {
    // 0.5M input -> ceil(0.5 * 150_000) = 75_000
    // 0.1M output -> ceil(0.1 * 600_000) = 60_000
    expect(costMicros('openai/gpt-oss-120b', 500_000, 100_000)).toBe(75_000 + 60_000);
  });

  test('unknown model throws', () => {
    expect(() => costMicros('unknown/model', 0, 0)).toThrow(/Unknown model/);
  });
});

describe('groq.callGroq', () => {
  const mockResponse = (status: number, body: any) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  test('successful request returns text and usage', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      mockResponse(200, {
        choices: [{ message: { content: 'Hello world' } }],
        usage: { prompt_tokens: 5, completion_tokens: 7 },
      }),
    );

    const req: ChatRequest = {
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: 'hi' }],
    };

    const result = await callGroq(req, 'test-key', fetchStub as any);

    // Verify fetch call
    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init?.method).toBe('POST');
    expect(init?.headers?.['Authorization']).toBe('Bearer test-key');
    expect(init?.headers?.['Content-Type']).toBe('application/json');
    const sentBody = JSON.parse(init?.body as string);
    expect(sentBody.stream).toBe(false);
    expect(sentBody.model).toBe('openai/gpt-oss-120b');
    expect(sentBody.messages).toEqual(req.messages);

    // Verify result mapping
    expect(result).toEqual({
      text: 'Hello world',
      promptTokens: 5,
      completionTokens: 7,
    });
  });

  test('non‑OK status throws error with status', async () => {
    const fetchStub = vi.fn().mockResolvedValue(mockResponse(502, {}));
    const req: ChatRequest = {
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: 'hi' }],
    };
    await expect(callGroq(req, 'key', fetchStub as any)).rejects.toThrow(/status 502/);
  });
});
