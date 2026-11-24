import { useRef, type ComponentType } from "react";
import { Atom, Link2, RefreshCw, Trash2 } from "lucide-react";
import type { MoleculeAtom } from "./model";
import type { Element } from "../science";

type IconProps = { size?: number; strokeWidth?: number };
type ActionIcon = ComponentType<IconProps>;

type Props = {
  open: boolean;
  x: number;
  y: number;
  radialAtom?: MoleculeAtom;
  onAddPair: () => void;
  onRemovePair: () => void;
  onElement: (element: Element) => void;
  onCharge: () => void;
  onRemoveAtom: () => void;
  onBondFrom: () => void;
  onBondOrder: () => void;
  onResonance: () => void;
};

const RADIUS = 100;

function PairIcon({ remove, size = 18, strokeWidth = 1.8 }: IconProps & { remove?: boolean }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden="true">
    <circle cx="8.5" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
    {remove ? <path d="M16 5h5" /> : <path d="M18.5 2.8v5.4M15.8 5.5h5.4" />}
  </svg>;
}

function ChargeIcon({ size = 18, strokeWidth = 1.8 }: IconProps) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden="true">
    <path d="M7.5 9.5h4M9.5 7.5v4" />
    <path d="M13 15.5h4" />
  </svg>;
}

function BondIcon({ size = 18, strokeWidth = 1.8 }: IconProps) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden="true">
    <path d="M4 7.5h16M4 12h16M4 16.5h16" />
  </svg>;
}

const ACTIONS: { id: string; label: string; angle: number; Icon: ActionIcon }[] = [
  { id: "radial-add-pair", label: "Lone pair", angle: -90, Icon: () => <PairIcon /> },
  { id: "radial-remove-pair", label: "Remove pair", angle: -45, Icon: () => <PairIcon remove /> },
  { id: "radial-element", label: "Element", angle: 0, Icon: Atom },
  { id: "radial-charge", label: "Charge", angle: 45, Icon: ChargeIcon },
  { id: "radial-remove", label: "Delete atom", angle: 90, Icon: Trash2 },
  { id: "radial-bond-from", label: "Start bond", angle: 135, Icon: Link2 },
  { id: "radial-bond-order", label: "Bond order", angle: 180, Icon: BondIcon },
  { id: "radial-resonance", label: "Resonance", angle: 225, Icon: RefreshCw },
];

export default function RadialAtomActions({ open, x, y, radialAtom, onAddPair, onRemovePair, onElement, onCharge, onRemoveAtom, onBondFrom, onBondOrder, onResonance }: Props) {
  const last = useRef<{ x: number; y: number; atom: MoleculeAtom } | undefined>(undefined);
  if (open && radialAtom) last.current = { x, y, atom: radialAtom };
  const shown = open && radialAtom ? { x, y, atom: radialAtom } : last.current;
  if (!shown) return null;
  const handlers: Record<string, () => void> = {
    "radial-add-pair": onAddPair,
    "radial-remove-pair": onRemovePair,
    "radial-element": () => onElement(shown.atom.element),
    "radial-charge": onCharge,
    "radial-remove": onRemoveAtom,
    "radial-bond-from": onBondFrom,
    "radial-bond-order": onBondOrder,
    "radial-resonance": onResonance,
  };
  return <div className="radial-actions" data-testid="radial-actions" data-open={open ? "true" : "false"} style={{ left: shown.x, top: shown.y }} aria-hidden={!open}>
    <span className="radial-hub" aria-hidden="true" />
    {ACTIONS.map((action, index) => {
      const rad = action.angle * Math.PI / 180;
      const rx = Math.cos(rad) * RADIUS, ry = Math.sin(rad) * RADIUS;
      return <button key={action.id} type="button" className="radial-action" data-testid={action.id} aria-label={action.label} title={action.label} tabIndex={open ? 0 : -1} disabled={!open} onClick={handlers[action.id]} style={{ left: `calc(50% + ${rx}px)`, top: `calc(50% + ${ry}px)`, ["--rx" as string]: `${rx}px`, ["--ry" as string]: `${ry}px`, ["--i" as string]: index }}>
        <span className="radial-action-icon"><action.Icon size={18} strokeWidth={action.Icon === Atom || action.Icon === Trash2 || action.Icon === Link2 || action.Icon === RefreshCw ? 1.8 : undefined} /></span>
        <span className="radial-action-label">{action.label}</span>
      </button>;
    })}
  </div>;
}
