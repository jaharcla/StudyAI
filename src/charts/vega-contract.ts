import { z } from "zod";

// One contract shared by the server tool and the chat renderer.
// Data is passed separately from the spec, mirroring the Vega MCP server's
// contract, so the spec stays readable and no remote URL is ever fetched.
const rows = z.array(z.record(z.string(), z.unknown()));

export const vegaChartSchema = z.object({
  spec: z.record(z.string(), z.unknown()),
  data: z.record(z.string(), rows).default({}),
}).strict();

export type VegaChartArgs = z.infer<typeof vegaChartSchema>;

export function referencedDataNames(spec: Record<string, unknown>): string[] {
  const names = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    const source = record.data;
    if (source && typeof source === "object" && !Array.isArray(source)) {
      const name = (source as Record<string, unknown>).name;
      if (typeof name === "string" && name.length > 0 && name.length <= 120) names.add(name);
    }
    for (const item of Object.values(record)) visit(item, depth + 1);
  };
  visit(spec, 0);
  return [...names];
}
