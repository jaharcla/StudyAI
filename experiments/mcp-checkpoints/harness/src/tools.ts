export type ToolSurface = "current" | "granular" | "batched";

export type ToolTrace = {
  surface: ToolSurface;
  taskId: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  invalidCalls: number;
  retries: number;
  durationMs: number;
  artifactQuality: number;
  completed: boolean;
};

export type ToolEfficiencyMetrics = {
  surface: ToolSurface;
  taskId: string;
  callsPerSuccess: number | null;
  inputTokensPerSuccess: number | null;
  outputTokensPerSuccess: number | null;
  invalidCallsPerSuccess: number | null;
  retriesPerSuccess: number | null;
  latencyMsPerSuccess: number | null;
  artifactQuality: number;
  completed: boolean;
};

export function toolEfficiency(trace: ToolTrace): ToolEfficiencyMetrics {
  const per = (value: number): number | null => (trace.completed ? value : null);
  return {
    surface: trace.surface,
    taskId: trace.taskId,
    callsPerSuccess: per(trace.calls),
    inputTokensPerSuccess: per(trace.inputTokens),
    outputTokensPerSuccess: per(trace.outputTokens),
    invalidCallsPerSuccess: per(trace.invalidCalls),
    retriesPerSuccess: per(trace.retries),
    latencyMsPerSuccess: per(trace.durationMs),
    artifactQuality: trace.artifactQuality,
    completed: trace.completed,
  };
}
