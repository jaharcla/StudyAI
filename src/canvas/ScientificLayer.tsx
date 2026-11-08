import { useEffect, useRef, useState } from "react";
import type { Editor } from "@quickdrawjs/react";
import { arrowGeometry, translateObject } from "./geometry";
import { createObject, type Point, type ScientificObject } from "./model";
import { vectorMagnitude } from "../science";
import { useMoleculeInteraction } from "./MoleculeInteraction";
import { anchorAt, lineGeometry, resolveScene, withLineEndpoints, type SceneLine } from "./scene";
import { SceneGlyph, objectTitle } from "./SceneGlyph";
import { SceneLineGlyph } from "./SceneLineGlyph";

export type ScienceMode = ScientificObject["kind"] | null;
type Props = { objects: ScientificObject[]; editor: Editor; mode: ScienceMode; placementPatch?: Partial<ScientificObject>; selectedId?: string; interactive: boolean; onSelect: (id?: string) => void; onEdit: (id: string) => void; onCommit: (objects: ScientificObject[]) => void; onFinish: () => void; onActivateMolecule: () => void; onOpenNote: (id: string) => void; onOpenDocument: (id: string, title: string) => void };
type Gesture = { pointerId: number; start: Point; before: ScientificObject[]; object: ScientificObject; operation: "create" | "move" | "tail" | "tip" | "resize" };
const isLine = (object: ScientificObject): object is SceneLine => ["vector", "force", "measurement", "relationship", "bond"].includes(object.kind);

export function ScientificLayer({ objects, editor, mode, placementPatch, selectedId, interactive, onSelect, onEdit, onCommit, onFinish, onActivateMolecule, onOpenNote, onOpenDocument }: Props) {
  const molecule = useMoleculeInteraction({ objects, editor, enabled: mode === "molecule", selectedId, interactive, onSelect, onEdit, onCommit, onFinish, onActivate: onActivateMolecule });
  const [preview, setPreview] = useState<ScientificObject[]>();
  const svg = useRef<SVGSVGElement>(null);
  const previewRef = useRef<ScientificObject[] | undefined>(undefined);
  const showPreview = (next?: ScientificObject[]) => { previewRef.current = next; setPreview(next); };
  const gesture = useRef<Gesture | undefined>(undefined);
  useEffect(() => {
    const element = svg.current;
    const wheel = (event: WheelEvent) => { event.preventDefault(); const rect = element!.getBoundingClientRect(); if (event.ctrlKey || event.metaKey) editor.zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.012)); else editor.pan(-event.deltaX, -event.deltaY); };
    element?.addEventListener("wheel", wheel, { passive: false });
    return () => element?.removeEventListener("wheel", wheel);
  }, [editor]);
  useEffect(() => { if (gesture.current && gesture.current.object.id !== selectedId) { gesture.current = undefined; previewRef.current = undefined; setPreview(undefined); } }, [selectedId]);
  const point = (event: React.PointerEvent<SVGElement>) => { const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? (event.currentTarget as SVGSVGElement).getBoundingClientRect(); return editor.screenToPage(event.clientX - rect.left, event.clientY - rect.top); };
  const begin = (event: React.PointerEvent<SVGElement>, object?: ScientificObject, operation: Gesture["operation"] = "move") => {
    if (event.button !== 0 || !interactive) return;
    event.preventDefault(); event.stopPropagation();
    const start = point(event);
    if (!object) {
      if (!mode || mode === "molecule") return;
      object = { ...createObject(mode, start.x, start.y), ...placementPatch } as ScientificObject;
      if (isLine(object)) {
        if (object.kind === "vector" || object.kind === "force") object = { ...object, components: [0, 0, 0], units: "" };
        if (object.kind === "measurement") object = { ...object, value: 0, units: "" };
        object = withLineEndpoints({ ...object, geometry: { tail: start, tip: start } }, start, start, { tailRef: anchorAt(start, objects, editor), tipRef: undefined });
      }
      operation = "create";
    }
    editor.setSelection([]);
    onSelect(object.id);
    gesture.current = { pointerId: event.pointerId, start, before: objects, object, operation };
    showPreview(operation === "create" ? [...objects, object] : objects);
    event.currentTarget.setPointerCapture(event.pointerId);
    editor.container.focus();
  };
  const move = (event: React.PointerEvent<SVGElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const end = point(event);
    if (current.operation === "move" && end.x === current.start.x && end.y === current.start.y) return;
    let next = current.object;
    if (isLine(next)) {
      const geometry = lineGeometry(next);
      if (current.operation === "move") {
        const dx = end.x - current.start.x, dy = end.y - current.start.y;
        if (next.kind === "vector" || next.kind === "force") { const moved = translateObject(next, dx, dy) as typeof next; next = { ...moved, geometry: { ...arrowGeometry(moved), tailRef: undefined, tipRef: undefined } }; }
        else next = withLineEndpoints(next, { x: geometry.tail.x + dx, y: geometry.tail.y + dy }, { x: geometry.tip.x + dx, y: geometry.tip.y + dy }, { tailRef: undefined, tipRef: undefined });
      } else {
        const tail = current.operation === "tail" ? end : geometry.tail, tip = current.operation === "tail" ? geometry.tip : end;
        next = withLineEndpoints(next, tail, tip, current.operation === "tail" ? { tailRef: anchorAt(end, current.before, editor, next.id) } : { tipRef: anchorAt(end, current.before, editor, next.id) });
      }
    } else if (current.operation === "resize") next = { ...next, width: Math.max(100, next.width + 2 * (end.x - current.start.x)), height: Math.max(65, next.height + 2 * (end.y - current.start.y)) };
    else next = translateObject(next, end.x - current.start.x, end.y - current.start.y);
    const updated = current.operation === "create" ? [...current.before, next] : current.before.map((object) => object.id === next.id ? next : object);
    showPreview(resolveScene({ version: 1, snapshot: editor.store.getSnapshot(), objects: updated }).objects);
  };
  const finish = (event: React.PointerEvent<SVGElement>, cancel = false) => {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const current = gesture.current;
    if (!cancel) move(event);
    const final = previewRef.current;
    if (!cancel && final) {
      const object = final.find((item) => item.id === current.object.id)!;
      const geometry = isLine(object) ? lineGeometry(object) : undefined;
      if (JSON.stringify(final) !== JSON.stringify(current.before) && (current.operation !== "create" || !geometry || Math.hypot(geometry.tip.x - geometry.tail.x, geometry.tip.y - geometry.tail.y) * editor.camera.z > 3)) onCommit(final);
    }
    gesture.current = undefined; showPreview(undefined); onFinish();
  };
  const visible = resolveScene({ version: 1, snapshot: editor.store.getSnapshot(), objects: preview ?? molecule.preview ?? objects }).objects;
  const origin = editor.pageToScreen(0, 0), zoom = editor.camera.z;
  return <>{molecule.controls}<svg ref={svg} className="scientific-layer" data-testid="scientific-layer" onPointerDownCapture={(event) => { if (mode && mode !== "molecule") begin(event); }} onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}>
    <defs><marker id="science-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="context-stroke" /></marker></defs>
    {mode && mode !== "molecule" && interactive && <rect className="science-placement-surface" width="100%" height="100%" fill="transparent" />}
    <g transform={`translate(${origin.x} ${origin.y}) scale(${zoom})`}>
      {molecule.surface}
      {visible.map((object) => {
        if (object.kind === "molecule") return molecule.render(object);
        if (object.kind !== "vector" && object.kind !== "force") {
          const selected = selectedId === object.id;
          if (isLine(object)) return <SceneLineGlyph key={object.id} object={object} zoom={zoom} selected={selected} interactive={interactive} onStart={(event, end) => begin(event, object, end ?? "move")} onEdit={() => onEdit(object.id)} />;
          return <g key={object.id} data-scientific-id={object.id} data-kind={object.kind} className={`scene-object ${selected ? "selected" : ""}`} style={{ pointerEvents: interactive ? "all" : "none" }} role="button" aria-label={objectTitle(object)} onPointerDown={(event) => begin(event, object)} onDoubleClick={(event) => { event.stopPropagation(); onEdit(object.id); }}>
            <rect className="scene-object-hit" x={object.x - object.width / 2} y={object.y - object.height / 2} width={object.width} height={object.height} />
            <SceneGlyph object={object} onOpenNote={onOpenNote} onOpenDocument={onOpenDocument} />
            {selected && <rect className="science-handle" data-resize="true" x={object.x + object.width / 2 - 5 / zoom} y={object.y + object.height / 2 - 5 / zoom} width={10 / zoom} height={10 / zoom} onPointerDown={(event) => begin(event, object, "resize")} />}
          </g>;
        }
        const geometry = arrowGeometry(object), selected = selectedId === object.id;
        return <g key={object.id} data-scientific-id={object.id} data-kind={object.kind} className={`science-arrow ${selected ? "selected" : ""}`} role="button" aria-label={`${object.kind} ${object.label}`} tabIndex={0} onDoubleClick={(event) => { event.stopPropagation(); onEdit(object.id); }}>
          <line className="science-hit" style={{ pointerEvents: interactive ? "stroke" : "none" }} aria-label="Move arrow" x1={geometry.tail.x} y1={geometry.tail.y} x2={geometry.tip.x} y2={geometry.tip.y} strokeWidth={16 / zoom} onPointerDown={(event) => begin(event, object)} />
          <line className="science-arrow-line" x1={geometry.tail.x} y1={geometry.tail.y} x2={geometry.tip.x} y2={geometry.tip.y} strokeWidth={2.5 / zoom} markerEnd="url(#science-arrowhead)" />
          {object.kind === "force" && <circle className="science-anchor" cx={geometry.tail.x} cy={geometry.tail.y} r={5 / zoom} />}
          <text x={(geometry.tail.x + geometry.tip.x) / 2} y={(geometry.tail.y + geometry.tip.y) / 2 - 12 / zoom} fontSize={12 / zoom}>{object.label} · {vectorMagnitude(...object.components).toFixed(2)} {object.geometry?.unitsPerCanvasUnit === undefined ? "canvas units" : object.units}</text>
          {selected && ["tail", "tip"].map((end) => <circle key={end} className="science-handle" style={{ pointerEvents: interactive ? "all" : "none" }} data-endpoint={end} aria-label={`Move ${end}`} cx={geometry[end as "tail" | "tip"].x} cy={geometry[end as "tail" | "tip"].y} r={6 / zoom} strokeWidth={1.5 / zoom} onPointerDown={(event) => begin(event, object, end as "tail" | "tip")} />)}
        </g>;
      })}
    </g>
  </svg></>;
}
