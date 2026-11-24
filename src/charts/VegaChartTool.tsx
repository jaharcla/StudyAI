import { useRenderTool } from "@copilotkit/react-core/v2";
import { useEffect, useRef, useState } from "react";
import vegaEmbed, { type VisualizationSpec } from "vega-embed";
import { buildChartSpec, CHART_DATASET, resolveChartFields, vegaChartSchema, type VegaChartArgs } from "./vega-contract";

function Chart({ args }: { args: VegaChartArgs }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let view: { finalize(): void } | undefined;
    setError(null);
    // Named data sources are supplied through Vega-Lite's `datasets`, so the
    // renderer never fetches a URL and the spec itself stays clean.
    // vega-embed treats a string spec as a URL, so pass the validated object.
    const spec: VisualizationSpec = { ...buildChartSpec(args), datasets: { [CHART_DATASET]: args.data } };
    vegaEmbed(element, spec, { actions: false, renderer: "svg" })
      .then((result) => {
        if (disposed) result.view.finalize();
        else view = result.view;
      })
      .catch((reason: unknown) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : "The chart could not be rendered.");
      });
    return () => {
      disposed = true;
      view?.finalize();
    };
  }, [args]);

  return (
    <div className="studyai-vega-chart" data-testid="vega-chart">
      <div ref={container} />
      {error ? <p role="alert" data-testid="vega-chart-error">{error}</p> : null}
    </div>
  );
}

export function VegaChartToolRenderer() {
  // Dev-only bridge so a browser test can render a fixture through the same
  // component path a completed tool call uses. It is stripped from prod builds.
  const [fixture, setFixture] = useState<VegaChartArgs | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const host = window as Window & { __studyaiVegaChart?: (args: VegaChartArgs) => void };
    host.__studyaiVegaChart = setFixture;
    return () => { delete host.__studyaiVegaChart; };
  }, []);

  useRenderTool({
    name: "show_vegalite_chart",
    parameters: vegaChartSchema,
    render: ({ status, parameters }) => {
      if (status !== "complete") return <p data-testid="vega-chart-status">Rendering chart…</p>;
      const parsed = vegaChartSchema.safeParse(parameters);
      if (!parsed.success) return <p role="alert" data-testid="vega-chart-error">Chart arguments were invalid.</p>;
      return <Chart args={resolveChartFields(parsed.data)} />;
    },
  }, []);
  return fixture ? <Chart args={fixture} /> : null;
}
