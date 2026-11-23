import { useState } from "react";
import type { Element } from "../science";
import type { BondOrder } from "./model";
import { bondOrderGlyph } from "./lewis-bonds";

const ELEMENTS: Element[] = ["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"];
const ORDERS: BondOrder[] = [1, 2, 3, 1.5];

type Props = {
  element: Element;
  order: BondOrder;
  onElement: (element: Element) => void;
  onBondOrder: (order: BondOrder) => void;
  onClose: () => void;
  onInspect: () => void;
  onFinish: () => void;
  onPlace: () => void;
  onConnect: () => void;
};

export default function LewisSidebar({ element, order, onElement, onBondOrder, onClose, onInspect, onFinish, onPlace, onConnect }: Props) {
  const [expanded, setExpanded] = useState(false);
  return <aside className="lewis-sidebar" role="toolbar" aria-label="Lewis tools">
    <div className="palette-heading"><span>LEWIS</span><button className="icon-button" aria-label="Close Lewis tools" title="Close Lewis tools" onClick={onClose}>×</button></div>
    <div className="bond-row" data-testid="lewis-bond-row">
      <button className="bond-current" data-testid="lewis-bond-row-toggle" aria-expanded={expanded} aria-label="Choose bond order" onClick={() => setExpanded(!expanded)}><span className="bond-glyph">{bondOrderGlyph(order)}</span><span aria-hidden="true">{expanded ? "▴" : "▾"}</span></button>
      {expanded && <div className="bond-options" data-testid="lewis-bond-options">{ORDERS.map((value) => <button key={value} data-testid={`lewis-bond-${value}`} className={value === order ? "current" : ""} aria-label={`Bond order ${value}`} onClick={() => { onBondOrder(value); setExpanded(false); }}><span className="bond-glyph">{bondOrderGlyph(value)}</span></button>)}</div>}
    </div>
    <div className="palette-group"><h2>Elements</h2><div className="element-list">{ELEMENTS.map((item) => <button key={item} data-testid={`lewis-element-row-${item}`} className={`element-row ${item === element ? "selected" : ""}`} aria-label={`Place ${item}`} onClick={() => onElement(item)}><span className="element-chip" aria-hidden="true">{item}</span></button>)}</div></div>
    <div className="lewis-actions"><button className="button-soft" data-testid="lewis-place" onClick={onPlace}>Place atoms</button><button className="button-soft" data-testid="lewis-connect" onClick={onConnect}>Connect atoms</button><button className="button-soft" data-testid="lewis-inspect" onClick={onInspect}>Inspect</button><button className="button-primary" data-testid="lewis-finish" onClick={onFinish}>Done</button></div>
  </aside>;
}
