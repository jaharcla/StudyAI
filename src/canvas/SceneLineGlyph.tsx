import { lineGeometry, type SceneLine } from "./scene";

export function SceneLineGlyph({ object, zoom, selected, interactive, onStart, onEdit }: { object: SceneLine; zoom: number; selected: boolean; interactive: boolean; onStart: (event: React.PointerEvent<SVGElement>, end?: "tail" | "tip") => void; onEdit: () => void }) {
  const geometry = lineGeometry(object), { tail, tip } = geometry;
  const label = object.kind === "measurement" ? `${object.label} · ${Number(object.value.toFixed(3))} ${geometry.unitsPerCanvasUnit === undefined ? "canvas units" : object.units}` : object.label;
  const offsets = object.kind === "bond" ? object.order === 3 ? [-4, 0, 4] : object.order === 2 ? [-2, 2] : [0] : [0];
  return <g data-scientific-id={object.id} data-kind={object.kind} className={`scene-line ${selected ? "selected" : ""}`} onDoubleClick={onEdit}>
    <line className="science-hit" style={{ pointerEvents: interactive ? "stroke" : "none" }} x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} strokeWidth={16 / zoom} onPointerDown={(event) => onStart(event)} />
    {offsets.map((offset) => { const length = Math.hypot(tip.x - tail.x, tip.y - tail.y) || 1, dx = -(tip.y - tail.y) / length * offset, dy = (tip.x - tail.x) / length * offset; return <line key={offset} className="scene-line-stroke" x1={tail.x + dx} y1={tail.y + dy} x2={tip.x + dx} y2={tip.y + dy} strokeWidth={2 / zoom} strokeDasharray={object.kind === "bond" && object.order === 1.5 ? "4 3" : undefined} markerEnd={object.kind === "relationship" ? "url(#science-arrowhead)" : undefined} />; })}
    {object.kind === "measurement" && [tail, tip].map((p, index) => <circle key={index} cx={p.x} cy={p.y} r={4 / zoom} className="measurement-tick" />)}
    <text x={(tail.x + tip.x) / 2} y={(tail.y + tip.y) / 2 - 10 / zoom} fontSize={12 / zoom}>{label}</text>
    {selected && (["tail", "tip"] as const).map((end) => <circle key={end} className="science-handle" style={{ pointerEvents: interactive ? "all" : "none" }} data-endpoint={end} cx={geometry[end].x} cy={geometry[end].y} r={6 / zoom} onPointerDown={(event) => onStart(event, end)} />)}
  </g>;
}
