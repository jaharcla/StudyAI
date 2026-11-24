import { formatArrowLabel } from "./model";
import { lineGeometry, type SceneLine } from "./scene";

export function SceneLineGlyph({ object, zoom, selected, interactive, onStart, onEdit }: { object: SceneLine; zoom: number; selected: boolean; interactive: boolean; onStart: (event: React.PointerEvent<SVGElement>, end?: "tail" | "tip") => void; onEdit: () => void }) {
  const geometry = lineGeometry(object), { tail, tip } = geometry;
  const label = object.kind === "measurement" ? formatArrowLabel(object.label, object.value, object.units) : object.label;
  const offsets = object.kind === "bond" ? object.order === 3 ? [-8, 0, 8] : object.order === 2 ? [-4, 4] : [0] : [0];
  return <g data-scientific-id={object.id} data-kind={object.kind} className={`scene-line ${selected ? "selected" : ""}`} role="button" aria-label={label} tabIndex={0} onDoubleClick={onEdit}>
    <line className="science-hit" style={{ pointerEvents: interactive ? "stroke" : "none" }} x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} strokeWidth={16 / zoom} onPointerDown={(event) => onStart(event)} />
    {offsets.map((offset) => { const length = Math.hypot(tip.x - tail.x, tip.y - tail.y) || 1, dx = -(tip.y - tail.y) / length * offset, dy = (tip.x - tail.x) / length * offset; return <line key={offset} className="scene-line-stroke" x1={tail.x + dx} y1={tail.y + dy} x2={tip.x + dx} y2={tip.y + dy} strokeWidth={2 / zoom} strokeDasharray={object.kind === "bond" && object.order === 1.5 ? "4 3" : undefined} markerEnd={object.kind === "relationship" ? "url(#science-arrowhead)" : undefined} />; })}
    {object.kind === "measurement" && [tail, tip].map((p, index) => <circle key={index} cx={p.x} cy={p.y} r={4 / zoom} className="measurement-tick" />)}
    <g className="scene-label" transform={`translate(${(tail.x + tip.x) / 2} ${(tail.y + tip.y) / 2 - 10 / zoom})`}>
      <rect className="scene-label-chip" data-testid="label-chip" x={-(label.length * 3 + 8 / zoom)} y={-12 / zoom} width={label.length * 6 + 16 / zoom} height={19 / zoom} rx={4 / zoom} />
      <text textAnchor="middle" y={3 / zoom} fontSize={11 / zoom}>{label}</text>
    </g>
    {selected && (["tail", "tip"] as const).map((end) => <circle key={end} className="science-handle" style={{ pointerEvents: interactive ? "all" : "none" }} data-endpoint={end} cx={geometry[end].x} cy={geometry[end].y} r={6 / zoom} onPointerDown={(event) => onStart(event, end)} />)}
  </g>;
}
