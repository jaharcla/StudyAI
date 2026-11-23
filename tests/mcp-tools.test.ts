import { describe, expect, it } from "vitest";
import { normalizeVegaSpec, normalizeWolframText } from "../server/mcp-tools";
import { referencedDataNames, vegaChartSchema } from "../src/charts/vega-contract";

const bar = {
  mark: "bar",
  encoding: { x: { field: "category", type: "nominal" }, y: { field: "value", type: "quantitative" } },
  data: { name: "table" },
};

describe("normalizeWolframText", () => {
  it("keeps a normal result unchanged", () => {
    const result = normalizeWolframText("Out[1]= 1/3");
    expect(result).toEqual({ result: "Out[1]= 1/3", truncated: false, hasMessage: false });
  });

  it("detects a Wolfram message as a failed computation", () => {
    const result = normalizeWolframText("Plot::argrx: Plot called with 0 arguments.");
    expect(result.hasMessage).toBe(true);
  });

  it("bounds a large result and marks the omitted middle", () => {
    const result = normalizeWolframText("x".repeat(30_000));
    expect(result.truncated).toBe(true);
    expect(result.result).toContain("[middle omitted by StudyAI]");
    expect(result.result.length).toBeLessThan(13_000);
  });
});

describe("referencedDataNames", () => {
  it("finds named sources inside layers", () => {
    expect(referencedDataNames({ layer: [{ data: { name: "points" } }, { data: { name: "line" } }] }).sort()).toEqual(["line", "points"]);
  });
});

describe("normalizeVegaSpec", () => {
  it("accepts a valid spec with matching data", () => {
    const args = vegaChartSchema.parse({ spec: bar, data: { table: [{ category: "A", value: 1 }] } });
    expect(normalizeVegaSpec(args).ok).toBe(true);
  });

  it("rejects a malformed mark that the MCP server would accept", () => {
    const args = vegaChartSchema.parse({ spec: { ...bar, mark: "banana" }, data: { table: [] } });
    expect(normalizeVegaSpec(args).ok).toBe(false);
  });

  it("rejects a named source with no supplied rows", () => {
    const args = vegaChartSchema.parse({ spec: bar, data: {} });
    expect(normalizeVegaSpec(args)).toMatchObject({ ok: false });
    expect(normalizeVegaSpec(args).error).toContain("table");
  });
});
