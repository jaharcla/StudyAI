import { useEffect, useRef, useState } from "react";
import type { Editor } from "@quickdrawjs/react";
import { bondOrderSum, formalChargeForAtom, moleculeBonds, type BondOrder, type Point, type ScientificObject } from "./model";
import { atomWorldPosition, connectAtoms, moleculeBounds, moveAtom, placeAtom, type ScientificMolecule } from "./molecules";
import type { Element } from "../science";
import { translateObject } from "./geometry";

type Props = { objects: ScientificObject[]; editor: Editor; enabled: boolean; interactive: boolean; selectedId?: string; onSelect: (id?: string) => void; onEdit: (id: string) => void; onCommit: (objects: ScientificObject[]) => void; onActivate: () => void; onFinish: () => void };
type Drag = { pointer: number; start: Point; molecule: ScientificMolecule; atomId?: string; bondFrom?: string; before: ScientificObject[] };

export function useMoleculeInteraction({ objects, editor, enabled, interactive, selectedId, onSelect, onEdit, onCommit, onActivate, onFinish }: Props) {
  const [action, setAction] = useState<"atom" | "bond" | "move">("atom");
  const [element, setElement] = useState<Element>("C");
  const [order, setOrder] = useState<BondOrder>(1);
  const [atomId, setAtomId] = useState<string>();
  const [bondId, setBondId] = useState<string>();
  const [bondFrom, setBondFrom] = useState<string>();
  const [cursor, setCursor] = useState<Point>();
  const [preview, setPreview] = useState<ScientificObject[]>();
  const previewRef = useRef<ScientificObject[] | undefined>(undefined);
  const drag = useRef<Drag | undefined>(undefined);
  useEffect(() => { if (drag.current && drag.current.molecule.id !== selectedId) { drag.current = undefined; previewRef.current = undefined; setPreview(undefined); setBondFrom(undefined); } }, [selectedId]);
  const selected = objects.find((object): object is ScientificMolecule => object.id === selectedId && object.kind === "molecule");
  const selectedAtom = selected?.atoms.find((atom) => atom.id === atomId);
  const selectedBond = selected && moleculeBonds(selected).find((bond) => bond.id === bondId);
  const point = (event: React.PointerEvent<SVGElement>) => { const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect(); return editor.screenToPage(event.clientX - rect.left, event.clientY - rect.top); };
  const replace = (next: ScientificMolecule, before = objects) => before.some((object) => object.id === next.id) ? before.map((object) => object.id === next.id ? next : object) : [...before, next];
  const commit = (next: ScientificMolecule) => { onCommit(replace(next)); onSelect(next.id); };
  const updateAtom = (patch: Partial<NonNullable<typeof selectedAtom>>) => { if (selected && selectedAtom) commit({ ...selected, atoms: selected.atoms.map((atom) => atom.id === selectedAtom.id ? { ...atom, ...patch } : atom) }); };
  const updateBond = (value: BondOrder) => { if (selected && selectedBond) commit(connectAtoms(selected, selectedBond.from, selectedBond.to, value)); };
  const start = (event: React.PointerEvent<SVGElement>, molecule: ScientificMolecule, child?: string) => {
    if (!interactive || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); editor.setSelection([]); onSelect(molecule.id); editor.container.focus();
    const atom = molecule.atoms.find((item) => item.id === child);
    setAtomId(atom?.id); setBondId(atom ? undefined : child);
    if (enabled && action === "bond" && atom) {
      if (bondFrom && bondFrom !== atom.id && molecule.atoms.some((item) => item.id === bondFrom)) { commit(connectAtoms(molecule, bondFrom, atom.id, order)); setBondFrom(undefined); return; }
      setBondFrom(atom.id); setCursor(atomWorldPosition(molecule, atom));
      drag.current = { pointer: event.pointerId, start: point(event), molecule, bondFrom: atom.id, before: objects };
    } else drag.current = { pointer: event.pointerId, start: point(event), molecule, atomId: action === "move" && enabled ? undefined : atom?.id, before: objects };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<SVGElement>) => {
    if (enabled && bondFrom) setCursor(point(event));
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId || current.bondFrom) return;
    event.stopPropagation(); const end = point(event);
    const next = current.atomId ? moveAtom(current.molecule, current.atomId, end) : translateObject(current.molecule, end.x - current.start.x, end.y - current.start.y) as ScientificMolecule;
    previewRef.current = replace(next, current.before); setPreview(previewRef.current);
  };
  const finish = (event: React.PointerEvent<SVGElement>, cancel = false) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    event.stopPropagation();
    if (!cancel && current.bondFrom) {
      const end = point(event);
      const hit = current.molecule.atoms.find((atom) => { const at = atomWorldPosition(current.molecule, atom); return Math.hypot(at.x - end.x, at.y - end.y) < 18 / editor.camera.z; });
      if (hit && hit.id !== current.bondFrom) { commit(connectAtoms(current.molecule, current.bondFrom, hit.id, order)); setBondFrom(undefined); }
    } else if (!cancel) {
      move(event);
      if (previewRef.current && JSON.stringify(previewRef.current) !== JSON.stringify(current.before)) onCommit(previewRef.current);
    }
    drag.current = undefined; previewRef.current = undefined; setPreview(undefined);
    if (cancel) setBondFrom(undefined);
  };
  const bounds = editor.viewportPageBounds();
  const surface = enabled && interactive ? <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="transparent" className="science-placement-surface" onPointerMove={(event) => { if (bondFrom) setCursor(point(event)); }} onPointerDown={(event) => {
    if (event.button !== 0) return; event.preventDefault(); event.stopPropagation();
    if (action !== "atom") { setAtomId(undefined); setBondId(undefined); setBondFrom(undefined); return; }
    const next = placeAtom(selected, point(event), element); commit(next); setAtomId(undefined); setBondId(undefined); editor.container.focus();
  }} /> : null;
  const controls = (enabled || selected) && <div className="molecule-drawing-tools" role="toolbar" aria-label="Molecule construction">
    <button className={enabled && action === "atom" ? "current" : ""} onClick={() => { setAction("atom"); setAtomId(undefined); setBondFrom(undefined); onActivate(); }}>Place atoms</button>
    <label>Placement element<select aria-label="Placement element" value={element} onChange={(event) => setElement(event.target.value as Element)}>{["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"].map((item) => <option key={item}>{item}</option>)}</select></label>
    <button className={enabled && action === "bond" ? "current" : ""} onClick={() => { setAction("bond"); setBondFrom(undefined); onActivate(); }}>Connect atoms</button>
    <label>Bond order<select aria-label="Drawing bond order" value={selectedBond?.order ?? order} onChange={(event) => { const next = Number(event.target.value) as BondOrder; setOrder(next); updateBond(next); }}>{[1, 1.5, 2, 3].map((item) => <option key={item}>{item}</option>)}</select></label>
    <button onClick={() => { setAction("move"); setBondFrom(undefined); onActivate(); }}>Move molecule</button>
    {selectedAtom && <><label>Selected element<select aria-label="Selected atom element" value={selectedAtom.element} onChange={(event) => updateAtom({ element: event.target.value as Element })}>{["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"].map((item) => <option key={item}>{item}</option>)}</select></label><button onClick={() => updateAtom({ nonbondingElectrons: selectedAtom.nonbondingElectrons + 2 })}>Add lone pair</button><button disabled={selectedAtom.nonbondingElectrons < 2} onClick={() => updateAtom({ nonbondingElectrons: selectedAtom.nonbondingElectrons - 2 })}>Remove lone pair</button></>}
    {selected && <button onClick={() => onEdit(selected.id)}>Inspect molecule</button>}
    {enabled && <button onClick={() => { setBondFrom(undefined); onFinish(); }}>Finish molecule</button>}
  </div>;
  const render = (molecule: ScientificMolecule) => {
    const box = moleculeBounds(molecule), zoom = editor.camera.z, selected = selectedId === molecule.id;
    const sourceAtom = molecule.atoms.find((atom) => atom.id === bondFrom);
    const from = sourceAtom && atomWorldPosition(molecule, sourceAtom);
    return <g key={molecule.id} data-scientific-id={molecule.id} data-kind="molecule" className={`science-molecule ${selected ? "selected" : ""}`} onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}>
      {selected && <rect className="molecule-selection" x={box.x} y={box.y} width={box.width} height={box.height} rx={8 / zoom} strokeWidth={1 / zoom} />}
      <text className="molecule-name" style={{ pointerEvents: interactive ? "all" : "none" }} x={box.x} y={box.y - 10 / zoom} fontSize={12 / zoom} onPointerDown={(event) => start(event, molecule)} onDoubleClick={() => onEdit(molecule.id)}>{molecule.name}</text>
      {moleculeBonds(molecule).map((bond) => {
        const a = atomWorldPosition(molecule, molecule.atoms.find((atom) => atom.id === bond.from)!); const b = atomWorldPosition(molecule, molecule.atoms.find((atom) => atom.id === bond.to)!);
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
        const inset = Math.min(17 / zoom, length / 3); const offsets = bond.order === 3 ? [-5, 0, 5] : bond.order === 2 ? [-3, 3] : [0];
        return <g key={bond.id} data-bond-id={bond.id} data-order={bond.order}>
          <line className="science-hit" style={{ pointerEvents: interactive ? "stroke" : "none" }} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={14 / zoom} onPointerDown={(event) => start(event, molecule, bond.id)} onDoubleClick={(event) => { event.stopPropagation(); commit(connectAtoms(molecule, bond.from, bond.to, bond.order >= 3 ? 1 : bond.order < 2 ? 2 : 3)); }} />
          {offsets.map((offset) => <line key={offset} className="molecule-bond" strokeDasharray={bond.order === 1.5 ? "4 3" : undefined} x1={a.x + ux * inset - uy * offset / zoom} y1={a.y + uy * inset + ux * offset / zoom} x2={b.x - ux * inset - uy * offset / zoom} y2={b.y - uy * inset + ux * offset / zoom} strokeWidth={2 / zoom} />)}
        </g>;
      })}
      {enabled && selected && from && cursor && <line className="molecule-bond-preview" x1={from.x} y1={from.y} x2={cursor.x} y2={cursor.y} strokeWidth={2 / zoom} />}
      {molecule.atoms.map((atom) => {
        const position = atomWorldPosition(molecule, atom), charge = formalChargeForAtom(atom, bondOrderSum(molecule, atom.id));
        return <g key={atom.id} data-atom-id={atom.id} data-element={atom.element} data-charge={charge} className={`molecule-atom ${selected && atom.id === atomId ? "selected" : ""}`} aria-label={`${atom.element} atom, formal charge ${charge}`}>
          <circle className="atom-hit" style={{ pointerEvents: interactive ? "all" : "none" }} cx={position.x} cy={position.y} r={17 / zoom} onPointerDown={(event) => start(event, molecule, atom.id)} onDoubleClick={(event) => { event.stopPropagation(); onEdit(molecule.id); }} />
          <text x={position.x} y={position.y + 6 / zoom} textAnchor="middle" fontSize={19 / zoom}>{atom.element}</text>
          {charge !== 0 && <text className="atom-charge" x={position.x + 13 / zoom} y={position.y - 13 / zoom} fontSize={11 / zoom}>{charge > 0 ? `+${charge}` : charge}</text>}
          {Array.from({ length: Math.min(12, atom.nonbondingElectrons) }, (_, index) => { const angle = [-Math.PI / 2, Math.PI / 2, Math.PI, 0][Math.floor(index / 2) % 4]; const across = index % 2 ? 3 : -3; return <circle key={index} className="lone-electron" cx={position.x + (Math.cos(angle) * 22 - Math.sin(angle) * across) / zoom} cy={position.y + (Math.sin(angle) * 22 + Math.cos(angle) * across) / zoom} r={1.6 / zoom} />; })}
        </g>;
      })}
      <text className="molecule-count" x={box.x} y={box.y + box.height + 17 / zoom} fontSize={10 / zoom}>{molecule.atoms.length} atoms · {moleculeBonds(molecule).length} bonds · {molecule.resonanceForms.length} form{molecule.resonanceForms.length === 1 ? "" : "s"}</text>
    </g>;
  };
  return { controls, surface, render, preview };
}
