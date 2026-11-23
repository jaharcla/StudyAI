import type { MoleculeAtom } from "./model";
import type { Element } from "../science";

type Props = {
  radialAtom: MoleculeAtom;
  onAddPair: () => void;
  onRemovePair: () => void;
  onElement: (element: Element) => void;
  onCharge: () => void;
  onRemoveAtom: () => void;
  onBondFrom: () => void;
  onBondOrder: () => void;
  onResonance: () => void;
};

const ACTIONS = [
  { id: "radial-add-pair", label: "+••", angle: -90 },
  { id: "radial-remove-pair", label: "−••", angle: -45 },
  { id: "radial-element", label: "E", angle: 0 },
  { id: "radial-charge", label: "±", angle: 45 },
  { id: "radial-remove", label: "×", angle: 90 },
  { id: "radial-bond-from", label: "↗", angle: 135 },
  { id: "radial-bond-order", label: "≡", angle: 180 },
  { id: "radial-resonance", label: "◌", angle: 225 },
] as const;

export default function RadialAtomActions({ radialAtom, onAddPair, onRemovePair, onElement, onCharge, onRemoveAtom, onBondFrom, onBondOrder, onResonance }: Props) {
  const handlers: Record<string, () => void> = {
    "radial-add-pair": onAddPair,
    "radial-remove-pair": onRemovePair,
    "radial-element": () => onElement(radialAtom.element),
    "radial-charge": onCharge,
    "radial-remove": onRemoveAtom,
    "radial-bond-from": onBondFrom,
    "radial-bond-order": onBondOrder,
    "radial-resonance": onResonance,
  };
  return <g className="radial-actions" data-testid="radial-actions">
    {ACTIONS.map((action) => {
      const rad = action.angle * Math.PI / 180;
      const x = Math.cos(rad) * 40, y = Math.sin(rad) * 40;
      return <g key={action.id} transform={`translate(${x} ${y})`}>
        <circle r={11} />
        <text y={3} data-testid={action.id} onClick={(event) => { event.stopPropagation(); handlers[action.id](); }}>{action.label}</text>
      </g>;
    })}
  </g>;
}
