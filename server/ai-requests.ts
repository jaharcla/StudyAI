import PQueue from "p-queue";

export type AIProvider = "ollama" | "cloud";
type QueueOptions = { signal?: AbortSignal; timeout?: number; dedupeKey?: string };

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The request was aborted.", "AbortError");
}

export class AIRequestQueueFullError extends Error {
  constructor(readonly provider: AIProvider) {
    super(`The ${provider} AI request queue is full.`);
    this.name = "AIRequestQueueFullError";
  }
}

function positiveInteger(value: string | undefined, fallback: number, max: number): number {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < 1 || result > max) throw new Error(`Invalid AI request setting: ${value}`);
  return result;
}

export class AIRequestQueues {
  private readonly queues: Record<AIProvider, PQueue>;
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly timeout: number;
  private readonly maxQueued: number;

  constructor(settings: { ollamaConcurrency?: number; cloudConcurrency?: number; timeoutMs?: number; maxQueued?: number } = {}) {
    this.queues = {
      ollama: new PQueue({ concurrency: settings.ollamaConcurrency ?? positiveInteger(process.env.AI_OLLAMA_CONCURRENCY, 2, 64) }),
      cloud: new PQueue({ concurrency: settings.cloudConcurrency ?? positiveInteger(process.env.AI_GROQ_CONCURRENCY ?? process.env.AI_CLOUD_CONCURRENCY, 2, 64) }),
    };
    this.timeout = settings.timeoutMs ?? positiveInteger(process.env.AI_REQUEST_TIMEOUT_MS, 120_000, 600_000);
    this.maxQueued = settings.maxQueued ?? positiveInteger(process.env.AI_MAX_QUEUED_REQUESTS, 8, 256);
  }

  run<T>(provider: AIProvider, task: (signal: AbortSignal | undefined) => Promise<T>, options: QueueOptions = {}): Promise<T> {
    const dedupeKey = options.signal ? undefined : options.dedupeKey && `${provider}:${options.dedupeKey}`;
    const existing = dedupeKey ? this.pending.get(dedupeKey) as Promise<T> | undefined : undefined;
    if (existing) return existing;
    const queue = this.queues[provider];
    if (queue.size >= this.maxQueued) return Promise.reject(new AIRequestQueueFullError(provider));
    const started = Date.now();
    if (options.signal?.aborted) return Promise.reject(abortReason(options.signal));
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(options.signal ? abortReason(options.signal) : undefined);
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
    const timeout = options.timeout ?? this.timeout;
    const timeoutId = setTimeout(() => controller.abort(new DOMException(`Task timed out after ${timeout}ms`, "TimeoutError")), timeout);
    const request = queue.add(({ signal }) => task(signal), { signal: controller.signal });
    void request.then(
      () => { clearTimeout(timeoutId); options.signal?.removeEventListener("abort", forwardAbort); },
      () => { clearTimeout(timeoutId); options.signal?.removeEventListener("abort", forwardAbort); },
    );
    if (dedupeKey) {
      this.pending.set(dedupeKey, request);
      void request.finally(() => { if (this.pending.get(dedupeKey) === request) this.pending.delete(dedupeKey); }).catch(() => undefined);
    }
    void request.then(
      () => this.diagnostic(provider, started, "complete"),
      (error) => this.diagnostic(provider, started, error instanceof Error ? error.name : "failed"),
    );
    return request as Promise<T>;
  }

  getStatus() {
    return Object.fromEntries(Object.entries(this.queues).map(([provider, queue]) => [provider, { pending: queue.pending, size: queue.size, concurrency: queue.concurrency }])) as Record<AIProvider, { pending: number; size: number; concurrency: number }>;
  }

  private diagnostic(provider: AIProvider, started: number, outcome: string) {
    if (process.env.AI_DIAGNOSTICS === "1") console.info(JSON.stringify({ type: "ai_request", provider, durationMs: Date.now() - started, outcome }));
  }
}

export const aiRequestQueues = new AIRequestQueues();
