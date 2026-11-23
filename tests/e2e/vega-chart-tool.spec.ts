import { expect, test } from "@playwright/test";

type ChartWindow = Window & { __studyaiVegaChart?: (args: unknown) => void };

const fixture = {
  mark: "bar",
  xField: "category",
  yField: "value",
  xType: "nominal",
  yType: "quantitative",
  data: [{ category: "A", value: 10 }, { category: "B", value: 20 }],
};

test("show_vegalite_chart renders a real svg chart in the chat DOM", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => typeof (window as ChartWindow).__studyaiVegaChart)).toBe("function");
  await page.evaluate((args) => (window as ChartWindow).__studyaiVegaChart?.(args), fixture);

  const chart = page.getByTestId("vega-chart");
  await expect(chart).toBeVisible();
  await expect(chart.locator("svg")).toBeVisible();
  await expect(chart.locator("path").first()).toBeAttached();
  await expect(page.getByTestId("vega-chart-error")).toHaveCount(0);
});
