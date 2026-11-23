import { createVegaChartTool, createWolframTools } from "../server/mcp-tools.js";

const { compute, alpha } = createWolframTools();
const chart = createVegaChartTool();

console.log("wolfram_compute:", await compute.invoke({ expression: "Expand[(x+1)^3]" }));
console.log("wolfram_alpha:", await alpha.invoke({ query: "molar mass of water" }));
console.log("show_vegalite_chart:", await chart.invoke({
  spec: {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    mark: "bar",
    encoding: { x: { field: "category", type: "nominal" }, y: { field: "value", type: "quantitative" } },
    data: { name: "table" },
  },
  data: { table: [{ category: "A", value: 10 }, { category: "B", value: 20 }] },
}));
