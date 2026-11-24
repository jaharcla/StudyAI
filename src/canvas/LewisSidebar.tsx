import { useState } from "react";
import { Atom, Check, ChevronDown, Link2, Plus, ScanSearch, X } from "lucide-react";
import type { Element } from "../science";
import type { BondOrder } from "./model";
import { bondOrderGlyph } from "./lewis-bonds";

const ELEMENTS: { symbol: Element; name: string }[] = [
  { symbol: "H", name: "Hydrogen" },
  { symbol: "C", name: "Carbon" },
  { symbol: "N", name: "Nitrogen" },
  { symbol: "O", name: "Oxygen" },
  { symbol: "F", name: "Fluorine" },
  { symbol: "P", name: "Phosphorus" },
  { symbol: "S", name: "Sulfur" },
  { symbol: "Cl", name: "Chlorine" },
  { symbol: "Br", name: "Bromine" },
  { symbol: "I", name: "Iodine" },
];
const ORDERS: { value: BondOrder; label: string }[] = [
  { value: 1, label: "Single" },
  { value: 1.5, label: "Partial" },
  { value: 2, label: "Double" },
  { value: 3, label: "Triple" },
];

type Props = {
  element: Element;
  order: BondOrder;
  action: "atom" | "bond" | "move";
  onElement: (element: Element) => void;
  onBondOrder: (order: BondOrder) => void;
  onClose: () => void;
  onInspect: () => void;
  onFinish: () => void;
  onPlace: () => void;
  onConnect: () => void;
};

export default function LewisSidebar({ element, order, action, onElement, onBondOrder, onClose, onInspect, onFinish, onPlace, onConnect }: Props) {
  const [expanded, setExpanded] = useState(false);
  return <aside className="lewis-sidebar" role="toolbar" aria-label="Lewis tools" data-testid="lewis-sidebar">
    <span className="lewis-connector" aria-hidden="true"><i /><b /></span>
    <header className="lewis-head">
      <span className="lewis-mark" aria-hidden="true"><Atom size={17} strokeWidth={1.8} /></span>
      <span className="lewis-heading"><b>Lewis structure</b><small>Build and edit a molecule</small></span>
      <button type="button" className="lewis-icon-button" aria-label="Close Lewis tools" title="Close Lewis tools" onClick={onClose}><X size={15} strokeWidth={1.9} /></button>
    </header>
    <div className="lewis-scroll">
      <section className="lewis-section" data-testid="lewis-bond-row">
        <h2>Bond order</h2>
        <button type="button" className="lewis-bond-current" data-testid="lewis-bond-row-toggle" aria-expanded={expanded} aria-label="Choose bond order" onClick={() => setExpanded(!expanded)}>
          <span className="lewis-bond-glyph" aria-hidden="true">{bondOrderGlyph(order)}</span>
          <span className="lewis-bond-label">{ORDERS.find((item) => item.value === order)?.label ?? "Single"}</span>
          <ChevronDown size={14} strokeWidth={2} className={expanded ? "is-open" : ""} aria-hidden="true" />
        </button>
        {expanded && <div className="lewis-bond-options" data-testid="lewis-bond-options">
          {ORDERS.map((item) => <button type="button" key={item.value} data-testid={`lewis-bond-${item.value}`} className={item.value === order ? "current" : ""} aria-label={`Bond order ${item.value}`} aria-pressed={item.value === order} onClick={() => { onBondOrder(item.value); setExpanded(false); }}>
            <span className="lewis-bond-glyph" aria-hidden="true">{bondOrderGlyph(item.value)}</span>
            <span>{item.label}</span>
          </button>)}
        </div>}
      </section>

      <section className="lewis-section">
        <h2>Element to place</h2>
        <div className="lewis-element-grid">
          {ELEMENTS.map((item) => <button type="button" key={item.symbol} data-testid={`lewis-element-row-${item.symbol}`} className={`lewis-element ${item.symbol === element ? "selected" : ""}`} aria-label={`Place ${item.symbol}`} aria-pressed={item.symbol === element} onClick={() => onElement(item.symbol)}>
            <span className="lewis-element-chip" aria-hidden="true">{item.symbol}</span>
            <span className="lewis-element-name">{item.name}</span>
            {item.symbol === element && <Check size={12} strokeWidth={2.4} className="lewis-element-check" aria-hidden="true" />}
          </button>)}
        </div>
      </section>

      <section className="lewis-section">
        <h2>Next action</h2>
        <div className="lewis-modes">
          <button type="button" data-testid="lewis-place" className={action === "atom" ? "current" : ""} aria-pressed={action === "atom"} onClick={onPlace}><Plus size={15} strokeWidth={1.9} aria-hidden="true" /><span>Place</span></button>
          <button type="button" data-testid="lewis-connect" className={action === "bond" ? "current" : ""} aria-pressed={action === "bond"} onClick={onConnect}><Link2 size={15} strokeWidth={1.9} aria-hidden="true" /><span>Connect</span></button>
          <button type="button" data-testid="lewis-inspect" onClick={onInspect}><ScanSearch size={15} strokeWidth={1.9} aria-hidden="true" /><span>Inspect</span></button>
        </div>
      </section>
    </div>
    <footer className="lewis-foot">
      <p>Select an atom to reveal its actions.</p>
      <button type="button" className="lewis-done" data-testid="lewis-finish" onClick={onFinish}><Check size={15} strokeWidth={2.2} aria-hidden="true" />Done</button>
    </footer>
  </aside>;
}
