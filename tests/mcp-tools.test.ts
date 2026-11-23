import { describe, expect, it } from "vitest";
import { normalizeVegaSpec, normalizeWolframText } from "../server/mcp-tools";
import { buildChartSpec, resolveChartFields, vegaChartSchema } from "../src/charts/vega-contract";

const rows = [{ category: "A", value: 10 }, { category: "B", value: 20 }];
const chartArgs = () => vegaChartSchema.parse({ xField: "category", yField: "value", data: rows });

describe("normalizeWolframText", () => {
  it("keeps a normal result unchanged", () => {
    expect(normalizeWolframText("Out[1]= 1/3")).toEqual({ result: "Out[1]= 1/3", truncated: false, hasMessage: false });
  });

  it("detects a Wolfram message as a failed computation", () => {
    expect(normalizeWolframText("Plot::argrx: Plot called with 0 arguments.").hasMessage).toBe(true);
  });

  it("bounds a large result and marks the omitted middle", () => {
    const result = normalizeWolframText("x".repeat(30_000));
    expect(result.truncated).toBe(true);
    expect(result.result).toContain("[middle omitted by StudyAI]");
    expect(result.result.length).toBeLessThan(13_000);
  });
});

describe("chart contract", () => {
  it("builds a Vega-Lite spec from simple chart parameters", () => {
    const spec = buildChartSpec(chartArgs());
    expect(spec).toMatchObject({
      mark: "bar",
      encoding: { x: { field: "category", type: "nominal" }, y: { field: "value", type: "quantitative" } },
      data: { name: "table" },
    });
  });

  it("accepts valid chart parameters", () => {
    expect(normalizeVegaSpec(chartArgs()).ok).toBe(true);
  });

  it("rejects a row array that is empty", () => {
    expect(() => vegaChartSchema.parse({ xField: "category", yField: "value", data: [] })).toThrow();
  });

  it("rejects a mark outside the published set", () => {
    expect(() => vegaChartSchema.parse({ mark: "banana", xField: "category", yField: "value", data: rows })).toThrow();
  });

  it("resolves model-supplied field names from the actual row keys", () => {
    const resolved = resolveChartFields(vegaChartSchema.parse({ xField: "A", yField: "B", data: rows }));
    expect([resolved.xField, resolved.yField]).toEqual(["category", "value"]);
    expect([resolved.xType, resolved.yType]).toEqual(["nominal", "quantitative"]);
  });
});
