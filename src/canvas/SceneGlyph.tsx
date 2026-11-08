import { useState } from "react";
import { formalCharge } from "../science";
import type { ScientificObject } from "./model";

export function objectTitle(object: ScientificObject): string {
  switch (object.kind) {
    case "molecule": return object.name;
    case "equation": return "Equation";
    case "graph": return "Graph";
    case "anatomy": return object.structureId || "Anatomy label";
    case "concept": case "linked-note": case "linked-document": return object.title;
    case "question": return "Practice question";
    case "flashcard": return "Flashcard";
    default: return object.label;
  }
}

export function SceneGlyph({ object, onOpenNote, onOpenDocument }: { object: ScientificObject; onOpenNote: (id: string) => void; onOpenDocument: (id: string, title: string) => void }) {
  if (object.kind === "graph") return <GraphPlot object={object} />;
  if (object.kind === "atom") {
    const charge = formalCharge(object.element, object.nonbondingElectrons, object.bondOrderSum);
    return <g className="scene-atom" transform={`translate(${object.x} ${object.y})`}><circle r="22" /><text textAnchor="middle" y="7" fontSize="24">{object.element}</text><text x="20" y="-20" fontSize="12">{charge === 0 ? "" : charge > 0 ? `+${charge}` : charge}</text></g>;
  }
  if (object.kind === "equation") return <g className="scene-equation" transform={`translate(${object.x - object.width / 2} ${object.y})`}><text fontSize="20">{object.expression}</text><text y="25" fontSize="13">{object.evaluationError ?? (object.result === undefined ? "Evaluating…" : `= ${Number(object.result.toPrecision(8))} ${object.units ?? ""}`)}</text></g>;
  let title = objectTitle(object), body = "";
  if (object.kind === "concept") body = object.definition;
  if (object.kind === "linked-note" || object.kind === "linked-document") body = object.excerpt;
  if (object.kind === "question") { title = object.prompt; body = object.answer ?? ""; }
  if (object.kind === "flashcard") { title = object.front; body = object.back; }
  if (object.kind === "anatomy") body = [object.system, ...object.labels].filter(Boolean).join(" · ");
  return <foreignObject x={object.x - object.width / 2} y={object.y - object.height / 2} width={object.width} height={object.height}>
    <div className={`scene-node scene-${object.kind}`}><strong>{title}</strong><span>{body}</span>
      {object.kind === "linked-note" && <button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenNote(object.noteId); }}>Open note</button>}
      {object.kind === "linked-document" && <button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenDocument(object.documentId, object.title); }}>Open source</button>}
    </div>
  </foreignObject>;
}

function GraphPlot({ object }: { object: Extract<ScientificObject, { kind: "graph" }> }) {
  const [trace, setTrace] = useState<number>();
  const w = object.width - 50, h = object.height - 55;
  const [minX, maxX] = object.xRange;
  const values = object.points.map(([, y]) => y);
  const minY = Math.min(...values, 0), maxY = Math.max(...values, 1);
  const xAt = (x: number) => (x - minX) / (maxX - minX || 1) * w;
  const yAt = (y: number) => h - (y - minY) / (maxY - minY || 1) * h;
  const step = (maxX - minX) / 120;
  const path = object.points.map(([x, y], index) => `${index && x - object.points[index - 1][0] < step * 1.5 ? "L" : "M"}${xAt(x)},${yAt(y)}`).join(" ");
  const sample = trace === undefined ? undefined : object.points[trace];
  return <g className="scene-graph" transform={`translate(${object.x - object.width / 2 + 35} ${object.y - object.height / 2 + 25})`} onPointerLeave={() => setTrace(undefined)}>
    <text y="-10" fontSize="12">{object.expression}</text><rect className="graph-surface" width={w} height={h} onPointerMove={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = minX + (event.clientX - rect.left) / rect.width * (maxX - minX);
      let nearest = 0; object.points.forEach(([px], index) => { if (Math.abs(px - x) < Math.abs(object.points[nearest][0] - x)) nearest = index; }); setTrace(nearest);
    }} />
    <path className="graph-axis" d={`M0 0 V${h} H${w}${minX < 0 && maxX > 0 ? ` M${xAt(0)} 0 V${h}` : ""}${minY < 0 && maxY > 0 ? ` M0 ${yAt(0)} H${w}` : ""}`} /><path className="graph-path" d={path} />
    <text y={h + 17} fontSize="10">{minX}</text><text x={w} y={h + 17} textAnchor="end" fontSize="10">{maxX} {object.xLabel}</text><text x="-25" y="5" fontSize="10">{object.yLabel}</text>
    <text x="-5" y="16" textAnchor="end" fontSize="9">{Number(maxY.toPrecision(3))}</text><text x="-5" y={h} textAnchor="end" fontSize="9">{Number(minY.toPrecision(3))}</text>
    {sample && <g className="graph-trace"><circle cx={xAt(sample[0])} cy={yAt(sample[1])} r="4" /><text x="5" y="14" fontSize="11">({sample[0].toFixed(2)}, {sample[1].toFixed(2)})</text></g>}
    {object.evaluationError && <text y={h / 2} fontSize="11">{object.evaluationError.slice(0, 60)}</text>}
  </g>;
}
