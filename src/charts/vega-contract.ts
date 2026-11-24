import { z } from "zod";

// One contract shared by the server tool and the chat renderer. The model
// supplies chart parameters, not a nested Vega-Lite document: a small local
// model reliably picks fields and rows but not a large nested JSON spec.
const fieldType = z.enum(["nominal", "ordinal", "quantitative", "temporal"]);

export const vegaChartSchema = z.object({
  mark: z.enum(["bar", "line", "point", "area"]).default("bar"),
  title: z.string().trim().min(1).max(160).optional(),
  xField: z.string().trim().min(1).max(80),
  yField: z.string().trim().min(1).max(80),
  xType: fieldType.default("nominal"),
  yType: fieldType.default("quantitative"),
  data: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
}).strict();

export type VegaChartArgs = z.infer<typeof vegaChartSchema>;

export const CHART_DATASET = "table";

// A small model often names fields after the question (e.g. "A", "B") rather
// than the row keys it supplied. Resolve them from the data instead of
// rejecting the call, and infer a sane type from the first row's values.
export function resolveChartFields(args: VegaChartArgs): VegaChartArgs {
  const keys = Object.keys(args.data[0] ?? {});
  if (keys.length === 0) return args;
  const infer = (field: string, fallback: VegaChartArgs["xType"]): VegaChartArgs["xType"] => {
    const value = args.data[0]?.[field];
    return typeof value === "number" ? "quantitative" : value === undefined ? fallback : "nominal";
  };
  const xField = keys.includes(args.xField) ? args.xField : keys[0];
  const yField = keys.includes(args.yField) ? args.yField : (keys.find((key) => key !== xField) ?? xField);
  return { ...args, xField, yField, xType: infer(xField, args.xType), yType: infer(yField, args.yType) };
}

export function buildChartSpec(args: VegaChartArgs) {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    mark: args.mark,
    ...(args.title ? { title: args.title } : {}),
    encoding: {
      x: { field: args.xField, type: args.xType },
      y: { field: args.yField, type: args.yType },
    },
    data: { name: CHART_DATASET },
  };
}
