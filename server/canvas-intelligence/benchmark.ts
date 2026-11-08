export type BenchmarkPipeline = "native-single" | "ocr-then-reason" | "dual-path-fusion";
export type BenchmarkObservation = { fixtureId: string; pipeline: BenchmarkPipeline; output: unknown; expected: unknown; latencyMs: number; modelCalls: number; peakMemoryBytes?: number; mocked: boolean };
export type BenchmarkReport = { mocked: boolean; results: Array<{ pipeline: BenchmarkPipeline; count: number; exactMatchRate: number; meanLatencyMs: number; meanModelCalls: number; peakMemoryBytes?: number }> };
export type BenchmarkRunner = (pipeline: BenchmarkPipeline, fixture: { id: string; records: unknown[]; imageText: string }) => Promise<{ output: unknown; modelCalls: number; peakMemoryBytes?: number; mocked: boolean }>;

export async function runCanvasBenchmark(fixtures: Array<{ id: string; records: unknown[]; imageText: string }>, expected: Record<string, unknown>, runner: BenchmarkRunner) {
  const observations: BenchmarkObservation[] = [];
  for (const fixture of fixtures) for (const pipeline of ["native-single", "ocr-then-reason", "dual-path-fusion"] as const) {
    const before = Date.now(), result = await runner(pipeline, fixture);
    observations.push({ fixtureId: fixture.id, pipeline, output: result.output, expected: expected[fixture.id], latencyMs: Date.now() - before, modelCalls: result.modelCalls, peakMemoryBytes: result.peakMemoryBytes, mocked: result.mocked });
  }
  return summarizeCanvasBenchmark(observations);
}

export function summarizeCanvasBenchmark(observations: BenchmarkObservation[]): BenchmarkReport {
  const mocked = observations.every((item) => item.mocked);
  const pipelines: BenchmarkPipeline[] = ["native-single", "ocr-then-reason", "dual-path-fusion"];
  return { mocked, results: pipelines.flatMap((pipeline) => {
    const rows = observations.filter((item) => item.pipeline === pipeline);
    if (!rows.length) return [];
    const exactMatchRate = rows.filter((item) => stable(item.output) === stable(item.expected)).length / rows.length;
    const memories = rows.map((row) => row.peakMemoryBytes).filter((value): value is number => typeof value === "number");
    return [{ pipeline, count: rows.length, exactMatchRate, meanLatencyMs: rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length, meanModelCalls: rows.reduce((sum, row) => sum + row.modelCalls, 0) / rows.length, ...(memories.length ? { peakMemoryBytes: Math.max(...memories) } : {}) }];
  }) };
}
const stable = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
