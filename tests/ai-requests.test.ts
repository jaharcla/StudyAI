import { describe, expect, it } from "vitest";
import { AIRequestQueueFullError, AIRequestQueues } from "../server/ai-requests";

describe("AI provider queues", () => {
  it("passes PQueue's abort signal to the provider task", async () => {
    const queues = new AIRequestQueues({ ollamaConcurrency: 1, cloudConcurrency: 1, timeoutMs: 1000, maxQueued: 1 });
    let receivedSignal: AbortSignal | undefined;
    await expect(queues.run("cloud", async (signal) => { receivedSignal = signal; return "ok"; })).resolves.toBe("ok");
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  it("keeps provider concurrency independent", async () => {
    const queues = new AIRequestQueues({ ollamaConcurrency: 1, cloudConcurrency: 2, timeoutMs: 1000, maxQueued: 8 });
    let activeLocal = 0;
    let maxLocal = 0;
    let activeCloud = 0;
    let maxCloud = 0;
    const hold = (provider: "ollama" | "cloud") => queues.run(provider, async () => {
      if (provider === "ollama") { activeLocal++; maxLocal = Math.max(maxLocal, activeLocal); }
      else { activeCloud++; maxCloud = Math.max(maxCloud, activeCloud); }
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (provider === "ollama") activeLocal--; else activeCloud--;
    });
    await Promise.all([hold("ollama"), hold("ollama"), hold("cloud"), hold("cloud"), hold("cloud")]);
    expect(maxLocal).toBe(1);
    expect(maxCloud).toBe(2);
  });

  it("bounds pending requests and rejects overflow before running it", async () => {
    const queues = new AIRequestQueues({ ollamaConcurrency: 1, cloudConcurrency: 1, timeoutMs: 1000, maxQueued: 1 });
    let release!: () => void;
    const first = queues.run("cloud", () => new Promise<void>((resolve) => { release = resolve; }));
    const queued = queues.run("cloud", async () => "queued");
    await expect(queues.run("cloud", async () => "overflow")).rejects.toBeInstanceOf(AIRequestQueueFullError);
    release();
    await first;
    await expect(queued).resolves.toBe("queued");
  });

  it("applies the request timeout while waiting in the queue", async () => {
    const queues = new AIRequestQueues({ ollamaConcurrency: 1, cloudConcurrency: 1, timeoutMs: 20, maxQueued: 2 });
    let release!: () => void;
    const active = queues.run("cloud", () => new Promise<void>((resolve) => { release = resolve; }), { timeout: 1000 });
    let queuedTaskStarted = false;
    const queued = queues.run("cloud", async () => { queuedTaskStarted = true; return "unexpected"; });
    await expect(queued).rejects.toMatchObject({ name: "TimeoutError" });
    expect(queuedTaskStarted).toBe(false);
    release();
    await active;
  });

  it("aborts queued requests and times out running requests", async () => {
    const queues = new AIRequestQueues({ ollamaConcurrency: 1, cloudConcurrency: 1, timeoutMs: 1000, maxQueued: 2 });
    let release!: () => void;
    const active = queues.run("ollama", async () => new Promise<void>((resolve) => { release = resolve; }));
    const controller = new AbortController();
    const cancelled = queues.run("ollama", async () => "never", { signal: controller.signal });
    controller.abort();
    await expect(cancelled).rejects.toBeDefined();
    release();
    await active;
    const runningQueues = new AIRequestQueues({ ollamaConcurrency: 1, cloudConcurrency: 1, timeoutMs: 1000, maxQueued: 1 });
    const runningController = new AbortController();
    let cancelledRunning = false;
    const running = runningQueues.run("cloud", (signal) => new Promise<void>((_resolve, reject) => {
      signal?.addEventListener("abort", () => { cancelledRunning = true; reject(signal.reason); }, { once: true });
    }), { signal: runningController.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    runningController.abort();
    await expect(running).rejects.toBeDefined();
    expect(cancelledRunning).toBe(true);
    const timedQueues = new AIRequestQueues({ ollamaConcurrency: 1, cloudConcurrency: 1, timeoutMs: 10, maxQueued: 1 });
    let aborted = false;
    const timed = timedQueues.run("cloud", (signal) => new Promise<string>((_resolve, reject) => {
      signal?.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true });
    }));
    await expect(timed).rejects.toMatchObject({ name: "TimeoutError" });
    expect(aborted).toBe(true);
  });
});
