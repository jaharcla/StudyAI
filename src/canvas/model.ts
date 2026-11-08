import type { Snapshot } from "@quickdrawjs/react";
import type { Element } from "../science";
import { synchronizeObject, type ArrowGeometry } from "./geometry";

export type Point = { x: number; y: number };
export type BondOrder = 1 | 1.5 | 2 | 3;
export type MoleculeAtom = { id: string; element: Element; nonbondingElectrons: number; position?: Point };
export type MoleculeBond = { id: string; from: string; to: string; order: BondOrder };
export type ResonanceForm = { id: string; name: string; bonds: MoleculeBond[] };
export type CanvasObjectBase = { id: string; x: number; y: number; width: number; height: number };

export type ScientificObject =
  | (CanvasObjectBase & { kind: "atom"; element: Element; nonbondingElectrons: number; bondOrderSum: number; label: string })
  | (CanvasObjectBase & { kind: "bond"; from: string; to: string; order: BondOrder; label: string })
  | (CanvasObjectBase & { kind: "molecule"; name: string; atoms: MoleculeAtom[]; resonanceForms: ResonanceForm[]; activeResonanceId: string })
  | (CanvasObjectBase & { kind: "equation"; expression: string; variables: Record<string, number>; units?: string })
  | (CanvasObjectBase & { kind: "vector"; components: [number, number, number]; units: string; label: string; geometry?: ArrowGeometry })
  | (CanvasObjectBase & { kind: "force"; components: [number, number, number]; units: string; label: string; pointOfApplication?: Point; geometry?: ArrowGeometry })
  | (CanvasObjectBase & { kind: "measurement"; value: number; units: string; label: string })
  | (CanvasObjectBase & { kind: "graph"; expression: string; xRange: [number, number]; points: Array<[number, number]>; xLabel: string; yLabel: string })
  | (CanvasObjectBase & { kind: "anatomy"; structureId: string; system: string; labels: string[] })
  | (CanvasObjectBase & { kind: "concept"; title: string; definition: string; conceptId?: string })
  | (CanvasObjectBase & { kind: "relationship"; fromId: string; toId: string; label: string })
  | (CanvasObjectBase & { kind: "linked-note"; noteId: string; title: string; excerpt: string })
  | (CanvasObjectBase & { kind: "linked-document"; documentId: string; title: string; excerpt: string })
  | (CanvasObjectBase & { kind: "question"; prompt: string; answer?: string; conceptId?: string })
  | (CanvasObjectBase & { kind: "flashcard"; front: string; back: string; conceptId?: string });

export type CanvasDocument = { version: 1; snapshot: Snapshot; objects: ScientificObject[] };

export function emptyCanvasDocument(): CanvasDocument {
  return { version: 1, snapshot: { document: { store: {} } }, objects: [] };
}

export function newId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function parseCanvasDocument(value: unknown): CanvasDocument {
  if (!value || typeof value !== "object") throw new Error("Invalid canvas file.");
  const record = value as Record<string, unknown>;
  if (record.version === 1 && record.snapshot && typeof record.snapshot === "object" && Array.isArray(record.objects)) {
    const snapshot = record.snapshot as Snapshot;
    if (!snapshot.document || !snapshot.document.store || typeof snapshot.document.store !== "object") throw new Error("Invalid drawing data.");
    record.objects.forEach(validateObject);
    if (new Set(record.objects.map((object) => object.id)).size !== record.objects.length) throw new Error("Duplicate scientific object IDs.");
    return { version: 1, snapshot, objects: (record.objects as ScientificObject[]).map((object) => synchronizeObject(object, object)) };
  }
  if (record.document && typeof record.document === "object" && "store" in record.document) {
    return { version: 1, snapshot: record as unknown as Snapshot, objects: [] };
  }
  throw new Error("Unsupported canvas file format.");
}

function validateObject(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid scientific object.");
  const object = value as Record<string, unknown>;
  const kinds = ["atom", "bond", "molecule", "equation", "vector", "force", "measurement", "graph", "anatomy", "concept", "relationship", "linked-note", "linked-document", "question", "flashcard"];
  if (!kinds.includes(String(object.kind)) || typeof object.id !== "string" || ![object.x, object.y, object.width, object.height].every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error("Invalid scientific object data.");
  const textFields: Record<string, string[]> = {
    atom: ["label"], bond: ["from", "to", "label"], equation: ["expression"], vector: ["units", "label"], force: ["units", "label"],
    measurement: ["units", "label"], graph: ["expression", "xLabel", "yLabel"], anatomy: ["structureId", "system"], concept: ["title", "definition"],
    relationship: ["fromId", "toId", "label"], "linked-note": ["noteId", "title", "excerpt"], "linked-document": ["documentId", "title", "excerpt"], question: ["prompt"], flashcard: ["front", "back"],
  };
  if ((textFields[String(object.kind)] ?? []).some((key) => typeof object[key] !== "string")) throw new Error("Invalid scientific text fields.");
  if (Number(object.width) <= 0 || Number(object.height) <= 0) throw new Error("Invalid object dimensions.");
  const elements = ["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"];
  if (object.kind === "molecule") {
    if (!Array.isArray(object.atoms) || !Array.isArray(object.resonanceForms) || typeof object.name !== "string") throw new Error("Invalid molecule data.");
    for (const atom of object.atoms as Array<Record<string, unknown>>) if (typeof atom.id !== "string" || !elements.includes(String(atom.element)) || !Number.isInteger(atom.nonbondingElectrons) || Number(atom.nonbondingElectrons) < 0) throw new Error("Invalid molecule atom data.");
    for (const atom of object.atoms) if (atom.position !== undefined && (!atom.position || ![atom.position.x, atom.position.y].every((n: unknown) => typeof n === "number" && Number.isFinite(n)))) throw new Error("Invalid atom position.");
    const atomIds = new Set(object.atoms.map((atom) => atom.id));
    if (atomIds.size !== object.atoms.length) throw new Error("Duplicate molecule atoms.");
    for (const form of object.resonanceForms as Array<Record<string, unknown>>) {
      if (typeof form.id !== "string" || typeof form.name !== "string" || !Array.isArray(form.bonds)) throw new Error("Invalid resonance form.");
      for (const bond of form.bonds as Array<Record<string, unknown>>) if (typeof bond.id !== "string" || typeof bond.from !== "string" || typeof bond.to !== "string" || typeof bond.order !== "number" || ![1, 1.5, 2, 3].includes(bond.order)) throw new Error("Invalid molecule bond data.");
      for (const bond of form.bonds) if (!atomIds.has(bond.from) || !atomIds.has(bond.to) || bond.from === bond.to) throw new Error("Invalid molecule bond endpoints.");
    }
    if (!object.resonanceForms.some((form) => (form as Record<string, unknown>).id === object.activeResonanceId)) throw new Error("Invalid active resonance form.");
  }
  if ((object.kind === "vector" || object.kind === "force") && (!Array.isArray(object.components) || object.components.length !== 3 || !object.components.every((n) => typeof n === "number" && Number.isFinite(n)))) throw new Error("Invalid vector data.");
  if ((object.kind === "vector" || object.kind === "force") && object.geometry !== undefined) {
    const geometry = object.geometry as ArrowGeometry;
    if (!geometry || ![geometry.tail?.x, geometry.tail?.y, geometry.tip?.x, geometry.tip?.y].every((n) => typeof n === "number" && Number.isFinite(n)) || (geometry.unitsPerCanvasUnit !== undefined && (!Number.isFinite(geometry.unitsPerCanvasUnit) || geometry.unitsPerCanvasUnit <= 0))) throw new Error("Invalid arrow geometry.");
  }
  if (object.kind === "atom" && (!elements.includes(String(object.element)) || !Number.isInteger(object.nonbondingElectrons) || Number(object.nonbondingElectrons) < 0 || typeof object.bondOrderSum !== "number" || !Number.isFinite(object.bondOrderSum) || object.bondOrderSum < 0)) throw new Error("Invalid atom data.");
  if (object.kind === "bond" && ![1, 1.5, 2, 3].includes(object.order as number)) throw new Error("Invalid bond order.");
  for (const field of ["conceptId", "answer"]) if (object[field] !== undefined && typeof object[field] !== "string") throw new Error("Invalid optional scientific text field.");
  if (object.kind === "graph" && (!Array.isArray(object.points) || !object.points.every((point) => Array.isArray(point) && point.length === 2 && point.every((n) => typeof n === "number" && Number.isFinite(n))))) throw new Error("Invalid graph data.");
  if (object.kind === "graph" && (!Array.isArray(object.xRange) || object.xRange.length !== 2 || !object.xRange.every((n) => typeof n === "number" && Number.isFinite(n)))) throw new Error("Invalid graph range.");
  if (object.kind === "anatomy" && (!Array.isArray(object.labels) || !object.labels.every((label) => typeof label === "string"))) throw new Error("Invalid anatomy labels.");
  if (object.kind === "measurement" && (typeof object.value !== "number" || !Number.isFinite(object.value))) throw new Error("Invalid measurement.");
  if (object.kind === "equation" && (!object.variables || typeof object.variables !== "object" || Array.isArray(object.variables) || !Object.values(object.variables).every((n) => typeof n === "number" && Number.isFinite(n)))) throw new Error("Invalid equation variables.");
}

export function moleculeBonds(molecule: Extract<ScientificObject, { kind: "molecule" }>) {
  return molecule.resonanceForms.find((form) => form.id === molecule.activeResonanceId)?.bonds ?? molecule.resonanceForms[0]?.bonds ?? [];
}

export function bondOrderSum(molecule: Extract<ScientificObject, { kind: "molecule" }>, atomId: string) {
  return moleculeBonds(molecule).reduce((sum, bond) => sum + ((bond.from === atomId || bond.to === atomId) ? bond.order : 0), 0);
}

export function formalChargeForAtom(atom: MoleculeAtom, sumBondOrder: number) {
  const valence: Record<Element, number> = { H: 1, C: 4, N: 5, O: 6, F: 7, P: 5, S: 6, Cl: 7, Br: 7, I: 7 };
  return valence[atom.element] - atom.nonbondingElectrons - sumBondOrder;
}

export function makeMolecule(x: number, y: number): Extract<ScientificObject, { kind: "molecule" }> {
  const first = newId("form");
  const left = newId("atom");
  const center = newId("atom");
  const right = newId("atom");
  return {
    id: newId("molecule"), kind: "molecule", x, y, width: 260, height: 154, name: "Carbon dioxide",
    atoms: [{ id: left, element: "O", nonbondingElectrons: 4 }, { id: center, element: "C", nonbondingElectrons: 0 }, { id: right, element: "O", nonbondingElectrons: 4 }],
    resonanceForms: [{ id: first, name: "Resonance form 1", bonds: [{ id: newId("bond"), from: left, to: center, order: 2 }, { id: newId("bond"), from: center, to: right, order: 2 }] }],
    activeResonanceId: first,
  };
}

export function sampleSquare([min, max]: [number, number]): Array<[number, number]> {
  return Array.from({ length: 13 }, (_, index) => {
    const x = min + (max - min) * index / 12;
    return [Number(x.toFixed(3)), Number((x * x).toFixed(3))];
  });
}

export function createObject(kind: ScientificObject["kind"], x: number, y: number): ScientificObject {
  const base = { id: newId(kind), x, y, width: 220, height: 110 };
  switch (kind) {
    case "atom": return { ...base, kind, element: "O", nonbondingElectrons: 4, bondOrderSum: 2, label: "Oxygen" };
    case "bond": return { ...base, kind, from: "atom-a", to: "atom-b", order: 2, label: "C=O" };
    case "molecule": return makeMolecule(x, y);
    case "equation": return { ...base, kind, expression: "y = x²", variables: { x: 0 } };
    case "vector": return { ...base, kind, components: [3, 4, 0], units: "", label: "Vector" };
    case "force": return { ...base, kind, components: [0, -9.8, 0], units: "N", label: "Force" };
    case "measurement": return { ...base, kind, value: 1, units: "m", label: "Measurement" };
    case "graph": return { ...base, kind, expression: "y = x²", xRange: [-3, 3], points: sampleSquare([-3, 3]), xLabel: "x", yLabel: "y" };
    case "anatomy": return { ...base, kind, structureId: "", system: "", labels: [] };
    case "concept": return { ...base, kind, title: "New concept", definition: "Add a definition." };
    case "relationship": return { ...base, kind, fromId: "", toId: "", label: "relates to" };
    case "linked-note": return { ...base, kind, noteId: "", title: "Linked note", excerpt: "" };
    case "linked-document": return { ...base, kind, documentId: "", title: "Linked document", excerpt: "" };
    case "question": return { ...base, kind, prompt: "Write a practice question." };
    case "flashcard": return { ...base, kind, front: "Term", back: "Definition" };
  }
}
