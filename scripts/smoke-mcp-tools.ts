import { createVegaChartTool, createWolframTools } from "../server/mcp-tools.js";

const { compute, alpha } = createWolframTools();
const chart = createVegaChartTool();

console.log("wolfram_compute:", await compute.invoke({ expression: "Expand[(x+1)^3]" }));
console.log("wolfram_alpha:", await alpha.invoke({ query: "molar mass of water" }));
console.log("show_vegalite_chart:", await chart.invoke({
  mark: "bar",
  xField: "category",
  yField: "value",
  data: [{ category: "A", value: 10 }, { category: "B", value: 20 }],
}));
