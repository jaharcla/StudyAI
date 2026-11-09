import type { Snapshot } from "@quickdrawjs/react";
import type { Element } from "../science";
import { synchronizeObject, type ArrowGeometry } from "./geometry";

export type Point = { x: number; y: number };
export type BondOrder = 1 | 1.5 | 2 | 3;
export type SerializableMathAst = string | number | boolean | null | SerializableMathAst[] | { [key: string]: SerializableMathAst };
export type MathParameter = { value: number; min: number; max: number; step: number };
export type MathStatement = { left: string; right: string };
export type MathStepOperation = { kind: "add-constant" | "subtract-constant" | "multiply-constant" | "divide-constant"; value: number } | { kind: "divide-by-variable"; variable: string } | { kind: "expand" };
export type MathVerifiedStep = { operation: MathStepOperation; before: MathStatement; after: MathStatement; status: "valid"; assumptions: string[]; domainRestrictions: string[] };
export type MathWorkspaceState = {
  schemaVersion: 1;
  latex: string;
  expressionAst: SerializableMathAst;
  parameters: Record<string, MathParameter>;
  dependencies: string[];
  assumptions: string[];
  domainRestrictions: string[];
  revision: number;
  statement: MathStatement;
  verifiedSteps: MathVerifiedStep[];
};
export type MoleculeAtom = { id: string; element: Element; nonbondingElectrons: number; position?: Point };
export type MoleculeBond = { id: string; from: string; to: string; order: BondOrder };
export type ResonanceForm = { id: string; name: string; bonds: MoleculeBond[] };
export type CanvasObjectBase = { id: string; x: number; y: number; width: number; height: number };

export type ScientificObject =
  | (CanvasObjectBase & { kind: "atom"; element: Element; nonbondingElectrons: number; bondOrderSum: number; label: string })
  | (CanvasObjectBase & { kind: "bond"; from: string; to: string; order: BondOrder; label: string; geometry?: ArrowGeometry })
  | (CanvasObjectBase & { kind: "molecule"; name: string; atoms: MoleculeAtom[]; resonanceForms: ResonanceForm[]; activeResonanceId: string })
  | (CanvasObjectBase & { kind: "equation"; expression: string; variables: Record<string, number>; units?: string; result?: number; evaluationError?: string; mathWorkspace?: MathWorkspaceState })
  | (CanvasObjectBase & { kind: "vector"; components: [number, number, number]; units: string; label: string; geometry?: ArrowGeometry })
  | (CanvasObjectBase & { kind: "force"; components: [number, number, number]; units: string; label: string; pointOfApplication?: Point; geometry?: ArrowGeometry })
  | (CanvasObjectBase & { kind: "measurement"; value: number; units: string; label: string; geometry?: ArrowGeometry })
  | (CanvasObjectBase & { kind: "graph"; expression: string; xRange: [number, number]; points: Array<[number, number]>; xLabel: string; yLabel: string; evaluationError?: string; sourceEquationId?: string })
  | (CanvasObjectBase & { kind: "anatomy"; structureId: string; system: string; labels: string[] })
  | (CanvasObjectBase & { kind: "concept"; title: string; definition: string; conceptId?: string })
  | (CanvasObjectBase & { kind: "relationship"; fromId: string; toId: string; label: string; geometry?: ArrowGeometry })
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
  if (["vector", "force", "measurement", "relationship", "bond"].includes(String(object.kind)) && object.geometry !== undefined) {
    const geometry = object.geometry as ArrowGeometry;
    if (!geometry || ![geometry.tail?.x, geometry.tail?.y, geometry.tip?.x, geometry.tip?.y].every((n) => typeof n === "number" && Number.isFinite(n)) || (geometry.unitsPerCanvasUnit !== undefined && (!Number.isFinite(geometry.unitsPerCanvasUnit) || geometry.unitsPerCanvasUnit <= 0))) throw new Error("Invalid arrow geometry.");
    for (const ref of [geometry.tailRef, geometry.tipRef]) if (ref !== undefined && (!ref || !["science", "quickdraw"].includes(ref.scope) || typeof ref.id !== "string" || (ref.atomId !== undefined && typeof ref.atomId !== "string") || [ref.u, ref.v].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)))) throw new Error("Invalid object attachment.");
  }
  if (object.kind === "atom" && (!elements.includes(String(object.element)) || !Number.isInteger(object.nonbondingElectrons) || Number(object.nonbondingElectrons) < 0 || typeof object.bondOrderSum !== "number" || !Number.isFinite(object.bondOrderSum) || object.bondOrderSum < 0)) throw new Error("Invalid atom data.");
  if (object.kind === "bond" && ![1, 1.5, 2, 3].includes(object.order as number)) throw new Error("Invalid bond order.");
  for (const field of ["conceptId", "answer"]) if (object[field] !== undefined && typeof object[field] !== "string") throw new Error("Invalid optional scientific text field.");
  if (object.kind === "graph" && (!Array.isArray(object.points) || !object.points.every((point) => Array.isArray(point) && point.length === 2 && point.every((n) => typeof n === "number" && Number.isFinite(n))))) throw new Error("Invalid graph data.");
  if (object.kind === "graph" && (!Array.isArray(object.xRange) || object.xRange.length !== 2 || !object.xRange.every((n) => typeof n === "number" && Number.isFinite(n)))) throw new Error("Invalid graph range.");
  if (object.kind === "anatomy" && (!Array.isArray(object.labels) || !object.labels.every((label) => typeof label === "string"))) throw new Error("Invalid anatomy labels.");
  if (object.kind === "measurement" && (typeof object.value !== "number" || !Number.isFinite(object.value))) throw new Error("Invalid measurement.");
  if (object.kind === "equation" && (!object.variables || typeof object.variables !== "object" || Array.isArray(object.variables) || !Object.values(object.variables).every((n) => typeof n === "number" && Number.isFinite(n)))) throw new Error("Invalid equation variables.");
  if (object.kind === "equation" && object.mathWorkspace !== undefined) validateMathWorkspace(object.mathWorkspace);
  if (object.kind === "graph" && object.sourceEquationId !== undefined && (typeof object.sourceEquationId !== "string" || !object.sourceEquationId)) throw new Error("Invalid graph equation link.");
  if (object.result !== undefined && (typeof object.result !== "number" || !Number.isFinite(object.result))) throw new Error("Invalid equation result.");
  if (object.evaluationError !== undefined && typeof object.evaluationError !== "string") throw new Error("Invalid evaluation error.");
}

function validateMathWorkspace(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid math workspace state.");
  const state = value as Record<string, unknown>;
  if (state.schemaVersion !== 1 || typeof state.latex !== "string" || state.latex.length > 500 || !Number.isSafeInteger(state.revision) || Number(state.revision) < 0) throw new Error("Invalid math workspace metadata.");
  if (!isJsonValue(state.expressionAst, 0, { count: 0 })) throw new Error("Invalid math expression AST.");
  if (!state.parameters || typeof state.parameters !== "object" || Array.isArray(state.parameters)) throw new Error("Invalid math parameters.");
  for (const [name, entry] of Object.entries(state.parameters)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(name) || !entry || typeof entry !== "object") throw new Error("Invalid math parameter.");
    const parameter = entry as Record<string, unknown>;
    if (![parameter.value, parameter.min, parameter.max, parameter.step].every((n) => typeof n === "number" && Number.isFinite(n)) || Number(parameter.min) >= Number(parameter.max) || Number(parameter.step) <= 0 || Number(parameter.value) < Number(parameter.min) || Number(parameter.value) > Number(parameter.max)) throw new Error("Invalid math parameter range.");
  }
  for (const field of ["dependencies", "assumptions", "domainRestrictions"] as const) {
    if (!Array.isArray(state[field]) || state[field].some((item) => typeof item !== "string" || item.length > 240) || state[field].length > 100) throw new Error(`Invalid math ${field}.`);
  }
  if (!isMathStatement(state.statement)) throw new Error("Invalid math statement.");
  if (!Array.isArray(state.verifiedSteps) || state.verifiedSteps.length > 100 || state.verifiedSteps.some((step) => !isVerifiedMathStep(step))) throw new Error("Invalid math step history.");
}

function isMathStatement(value: unknown): value is MathStatement {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const statement = value as Record<string, unknown>;
  return typeof statement.left === "string" && statement.left.length <= 500 && typeof statement.right === "string" && statement.right.length <= 500;
}

function isMathStepOperation(value: unknown): value is MathStepOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const operation = value as Record<string, unknown>;
  if (["add-constant", "subtract-constant", "multiply-constant", "divide-constant"].includes(String(operation.kind))) {
    return typeof operation.value === "number" && Number.isFinite(operation.value) && !(["multiply-constant", "divide-constant"].includes(String(operation.kind)) && operation.value === 0);
  }
  if (operation.kind === "divide-by-variable") return typeof operation.variable === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(operation.variable);
  return operation.kind === "expand";
}

function isVerifiedMathStep(value: unknown): value is MathVerifiedStep {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const step = value as Record<string, unknown>;
  if (step.status !== "valid" || !isMathStepOperation(step.operation) || !isMathStatement(step.before) || !isMathStatement(step.after)
    || ![step.assumptions, step.domainRestrictions].every((items) => Array.isArray(items) && items.length <= 100 && items.every((item) => typeof item === "string" && item.length <= 240))) return false;
  const operation = step.operation as MathStepOperation;
  if (operation.kind === "expand") return false;
  if (operation.kind === "divide-by-variable") {
    const variable = operation.variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [new RegExp(`^\\s*${variable}\\s*(?:!=|≠)\\s*0\\s*$`), new RegExp(`^\\s*0\\s*(?:!=|≠)\\s*${variable}\\s*$`)];
    if (![...(step.assumptions as string[]), ...(step.domainRestrictions as string[])].some((item) => patterns.some((pattern) => pattern.test(item)))) return false;
  }
  return true;
}

function isJsonValue(value: unknown, depth: number, state: { count: number }): value is SerializableMathAst {
  if (++state.count > 300 || depth > 24) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return typeof value !== "string" || value.length <= 500;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 200 && value.every((item) => isJsonValue(item, depth + 1, state));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return Object.entries(value).length <= 100 && Object.entries(value).every(([key, item]) => key.length <= 100 && isJsonValue(item, depth + 1, state));
  return false;
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
    case "equation": return { ...base, kind, expression: "x^2", variables: { x: 0 } };
    case "vector": return { ...base, kind, components: [3, 4, 0], units: "", label: "Vector" };
    case "force": return { ...base, kind, components: [0, -9.8, 0], units: "N", label: "Force" };
    case "measurement": return { ...base, kind, value: 1, units: "m", label: "Measurement" };
    case "graph": return { ...base, kind, width: 260, height: 180, expression: "x^2", xRange: [-3, 3], points: sampleSquare([-3, 3]), xLabel: "x", yLabel: "y" };
    case "anatomy": return { ...base, kind, structureId: "", system: "", labels: [] };
    case "concept": return { ...base, kind, title: "New concept", definition: "Add a definition." };
    case "relationship": return { ...base, kind, fromId: "", toId: "", label: "relates to" };
    case "linked-note": return { ...base, kind, noteId: "", title: "Linked note", excerpt: "" };
    case "linked-document": return { ...base, kind, documentId: "", title: "Linked document", excerpt: "" };
    case "question": return { ...base, kind, prompt: "Write a practice question." };
    case "flashcard": return { ...base, kind, front: "Term", back: "Definition" };
  }
}
