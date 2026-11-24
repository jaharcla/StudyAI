import { useState } from "react";
import katex from "katex";
import { formalCharge } from "../science";
import { formatArrowLabel, type ScientificObject } from "./model";

const anatomyNames: Record<string, string> = {
  heart: "Heart", brain: "Brain", lung: "Lung", lungs: "Lungs", liver: "Liver", kidney: "Kidney",
  stomach: "Stomach", intestine: "Intestine", skeleton: "Skeleton", muscle: "Muscle", skin: "Skin",
};

function displayName(value: string) {
  return value.replace(/(^|[\s-])\w/g, (part) => part.toUpperCase());
}

export function objectTitle(object: ScientificObject): string {
  switch (object.kind) {
    case "molecule": return object.name;
    case "equation": return "Equation";
    case "graph": return "Graph";
    case "anatomy": return anatomyNames[object.structureId] ?? object.labels[0] ?? (object.structureId ? displayName(object.structureId) : "Anatomy label");
    case "concept": case "linked-note": case "linked-document": return object.title;
    case "question": return "Practice question";
    case "flashcard": return object.front;
    case "mindmap": return object.title;
    default: return object.label;
  }
}

function typeset(latex: string) {
  // katex.renderToString is declared at node_modules/katex/types/katex.d.ts:228.
  // output:"html" omits the MathML annotation, so raw `^` never leaks into the DOM.
  return katex.renderToString(latex, { throwOnError: false, output: "html", strict: false });
}

export function SceneGlyph({ object, onOpenNote, onOpenDocument, registeredCards = [] }: { object: ScientificObject; onOpenNote: (id: string) => void; onOpenDocument: (id: string, title: string) => void; registeredCards?: string[] }) {
  const [revealed, setRevealed] = useState(false);
  if (object.kind === "graph") return <GraphPlot object={object} />;
  if (object.kind === "atom") {
    const charge = formalCharge(object.element, object.nonbondingElectrons, object.bondOrderSum);
    return <g className="scene-atom" transform={`translate(${object.x} ${object.y})`}><circle r="22" /><text textAnchor="middle" y="7" fontSize="24">{object.element}</text><text x="20" y="-20" fontSize="12">{charge === 0 ? "" : charge > 0 ? `+${charge}` : charge}</text><text className="molecule-name" data-testid="atom-caption" textAnchor="middle" y="42" fontSize="11">{object.label}</text></g>;
  }
  if (object.kind === "equation") {
    const latex = object.mathWorkspace?.latex || object.expression;
    return <g className="scene-equation" transform={`translate(${object.x - object.width / 2} ${object.y - 34})`}>
      <foreignObject width={object.width} height={object.height}>
        <div className="equation-glyph">
          <div className="typeset-math" data-testid="typeset-math" dangerouslySetInnerHTML={{ __html: typeset(latex) }} />
          <div className="expression-result">{object.evaluationError ?? (object.result === undefined ? "= Evaluating…" : `= ${Number(object.result.toPrecision(8))} ${object.units ?? ""}`.trim())}</div>
        </div>
      </foreignObject>
    </g>;
  }
  if (object.kind === "mindmap") {
    const byId = new Map(object.nodes.map((node) => [node.id, node]));
    const rootId = object.nodes[0]?.id;
    const clip = (value: string) => value.length > 20 ? `${value.slice(0, 19)}…` : value;
    return <g className="scene-mindmap" data-testid="mindmap-root" transform={`translate(${object.x} ${object.y})`}>
      <title>{object.title}</title>
      <text className="mindmap-title" data-testid="mindmap-title" y={-object.height / 2 - 14} textAnchor="middle">{object.title}</text>
      {object.edges.map((edge, index) => {
        const from = byId.get(edge.from), to = byId.get(edge.to);
        if (!from || !to) return null;
        return <g key={`${edge.from}->${edge.to}-${index}`}>
          <line className="mindmap-edge" x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#science-arrowhead)" />
          {edge.label && <text className="mindmap-edge-label" data-testid={`mindmap-edge-label-${index}`} x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6} textAnchor="middle">{edge.label}</text>}
        </g>;
      })}
      {object.nodes.map((node) => <g key={node.id} data-testid={`mindmap-node-${node.id}`} className={node.id === rootId ? "mindmap-root-node" : "mindmap-node"} transform={`translate(${node.x} ${node.y})`}><rect className="mindmap-node-box" x={-70} y={-21} width={140} height={42} rx={12} /><text textAnchor="middle" y={5}>{clip(node.label)}</text></g>)}
    </g>;
  }
  let title = objectTitle(object), body = "";
  if (object.kind === "concept") body = object.definition;
  if (object.kind === "linked-note" || object.kind === "linked-document") body = object.excerpt;
  if (object.kind === "question") { title = object.prompt; body = revealed ? object.answer ?? "" : ""; }
  if (object.kind === "flashcard") { title = object.front; body = revealed ? object.back : ""; }
  if (object.kind === "anatomy") body = [object.system, ...object.labels].filter(Boolean).join(" · ");
  const isFlashcard = object.kind === "flashcard";
  const isQuestion = object.kind === "question";
  return <foreignObject x={object.x - object.width / 2} y={object.y - object.height / 2} width={object.width} height={object.height}>
    <div className={`scene-node scene-${object.kind}`} data-testid="card-surface"><strong>{title}</strong>
      {isQuestion && object.scenario && <span className="scene-scenario">{object.scenario}</span>}
      {!isFlashcard && !isQuestion && <span>{body}</span>}
      {(isFlashcard || isQuestion) && revealed && <><span className="scene-answer-divider" /><span className="scene-answer-label">ANSWER</span><span className="scene-answer-body" data-testid="flashcard-back">{body}</span></>}
      {isFlashcard && registeredCards.includes(object.front) && <span className="scene-chip" data-testid="in-review-deck">In review deck</span>}
      {object.kind === "linked-note" && <button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenNote(object.noteId); }}>Open note</button>}
      {object.kind === "linked-document" && <button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenDocument(object.documentId, object.title); }}>Open source</button>}
      {isFlashcard && <button data-testid="flip-card" aria-label={revealed ? "Hide answer" : "Show answer"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setRevealed(!revealed); }}>{revealed ? "Hide answer" : "Show answer"}</button>}
      {isQuestion && <button data-testid="reveal-answer" aria-label={revealed ? "Hide answer" : "Reveal answer"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setRevealed(!revealed); }}>{revealed ? "Hide answer" : "Reveal answer"}</button>}
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
    <foreignObject x={0} y={-48} width={w} height={32}>
      <div className="typeset-math graph-title" data-testid="typeset-math" dangerouslySetInnerHTML={{ __html: typeset(object.expression) }} />
    </foreignObject>
    <rect className="graph-surface" width={w} height={h} onPointerMove={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = minX + (event.clientX - rect.left) / rect.width * (maxX - minX);
      let nearest = 0; object.points.forEach(([px], index) => { if (Math.abs(px - x) < Math.abs(object.points[nearest][0] - x)) nearest = index; }); setTrace(nearest);
    }} />
    <path className="graph-axis" d={`M0 0 V${h} H${w}${minX < 0 && maxX > 0 ? ` M${xAt(0)} 0 V${h}` : ""}${minY < 0 && maxY > 0 ? ` M0 ${yAt(0)} H${w}` : ""}`} /><path className="graph-path" d={path} />
    <text y={h + 19} fontSize="11">{minX}</text><text x={w} y={h + 19} textAnchor="end" fontSize="11">{maxX}</text>
    <text x={w / 2} y={h + 38} textAnchor="middle" fontSize="12">{object.xLabel}</text><text x={-25} y="5" fontSize="11">{object.yLabel}</text>
    <text x="-5" y="16" textAnchor="end" fontSize="11">{Number(maxY.toPrecision(3))}</text><text x="-5" y={h} textAnchor="end" fontSize="11">{Number(minY.toPrecision(3))}</text>
    {sample && <g className="graph-trace"><circle cx={xAt(sample[0])} cy={yAt(sample[1])} r="4" /><text x="5" y="14" fontSize="11">({sample[0].toFixed(2)}, {sample[1].toFixed(2)})</text></g>}
    {object.evaluationError && <text y={h / 2} fontSize="11">{object.evaluationError.slice(0, 60)}</text>}
  </g>;
}
