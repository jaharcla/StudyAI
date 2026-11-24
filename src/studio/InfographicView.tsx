import { Quote } from "lucide-react";
import { sourceLabel, type InfographicContent } from "./api";
import { buildInfographicFigure } from "./infographic";

export default function InfographicView({ content, onOpenSource }: { content: InfographicContent; onOpenSource: (ref: string) => void }) {
  const figure = buildInfographicFigure(content.diagram);
  const description = content.diagram.forces.length
    ? `${content.diagram.title}. Forces: ${content.diagram.forces.map((force) => `${force.label} ${Math.hypot(...force.components).toFixed(2)} units`).join(", ")}.`
    : `${content.diagram.title}. No forces supplied.`;

  return (
    <article className="studio-infographic" data-testid="infographic" aria-labelledby="studio-infographic-title">
      <header className="studio-doc-head">
        <h3 id="studio-infographic-title" className="studio-doc-title">{content.title}</h3>
        <p className="studio-lead">{content.objective}</p>
      </header>

      <figure className="studio-figure">
        <svg
          data-testid="infographic-svg"
          className="studio-infographic-svg"
          viewBox={`0 0 ${figure.width} ${figure.height}`}
          role="img"
          aria-label={description}
        >
          <title>{content.diagram.title}</title>
          <desc>{description}</desc>
          <rect className="studio-fig-surface" x="0" y="0" width={figure.width} height={figure.height} />
          {figure.angleDeg !== undefined && (
            <line
              className="studio-fig-ground"
              x1="40" y1={figure.center.y + 96} x2={figure.width - 40} y2={figure.center.y + 96}
              strokeDasharray="7 5"
              transform={`rotate(${-figure.angleDeg} ${figure.width / 2} ${figure.center.y + 96})`}
            />
          )}
          {figure.arrows.map((arrow, index) => {
            const angle = Math.atan2(arrow.y2 - arrow.y1, arrow.x2 - arrow.x1);
            const spread = 0.42;
            const head = [
              `${arrow.x2},${arrow.y2}`,
              `${arrow.x2 - 12 * Math.cos(angle - spread)},${arrow.y2 - 12 * Math.sin(angle - spread)}`,
              `${arrow.x2 - 12 * Math.cos(angle + spread)},${arrow.y2 - 12 * Math.sin(angle + spread)}`,
            ].join(" ");
            return (
              <g key={`${arrow.label}-${index}`} data-testid="infographic-force">
                <line className="studio-fig-arrow" x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} stroke={arrow.color} />
                <polygon className="studio-fig-head" points={head} fill={arrow.color} />
                <text className="studio-fig-label" x={arrow.lx} y={arrow.ly}>{arrow.label}</text>
              </g>
            );
          })}
        </svg>
        <figcaption className="studio-figure-caption" data-testid="infographic-caption">
          <span className="studio-figure-label">Figure</span>
          <span className="studio-figure-title">{content.diagram.title}</span>
          <span className="studio-figure-credit">Drawn locally from the lesson diagram</span>
          <span className="studio-figure-hint">Arrow length shows magnitude; direction shows the force</span>
        </figcaption>
      </figure>

      <div className="studio-infographic-details">
        <section className="studio-detail" aria-labelledby="studio-infographic-sources">
          <h4 id="studio-infographic-sources">Sources</h4>
          <div className="studio-citations" data-testid="infographic-citations">
            {content.sourceRefs.map((ref) => (
              <button key={ref} type="button" className="studio-cite surface-provenance" data-testid="citation-chip" onClick={() => onOpenSource(ref)}>
                <Quote size={12} strokeWidth={1.9} aria-hidden="true" />
                <span>{sourceLabel(ref)}</span>
              </button>
            ))}
          </div>
        </section>
        {content.diagram.forces.length > 0 && (
          <section className="studio-detail" aria-labelledby="studio-infographic-values">
            <h4 id="studio-infographic-values">Forces in this diagram</h4>
            <dl className="studio-figure-values">
              {content.diagram.forces.map((force, index) => (
                <div key={`${force.label}-${index}`}>
                  <dt>{force.label}</dt>
                  <dd>({force.components[0]}, {force.components[1]}) · {Math.hypot(...force.components).toFixed(2)} units</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </article>
  );
}
