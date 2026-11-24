import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Store, hitShape, pageBounds, type Diff, type DiffSource, type ShapeRecord } from "@quickdrawjs/core";
import { Quickdraw, type Editor, type QuickdrawRef } from "@quickdrawjs/react";
import { parseCanvasCitation } from "./citation-focus";
import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import type { CanvasAnalysisResult } from "../../server/canvas-analysis/contract.js";
import { API } from "../api";
import { ScientificLayer, type ScienceMode } from "./ScientificLayer";
import { arrowGeometry, directionAngleDegrees, synchronizeObject, withArrowEndpoints } from "./geometry";
import { analyzePhysicsFreeBodyDiagram } from "./physics";
import { lineGeometry, resolveScene, withLineEndpoints } from "./scene";
import { stableJson } from "./stable-json";
import { compileExpression, evaluateScientificObjects } from "./expressions";
import { GroundingBadges, objectTitle } from "./SceneGlyph";
import { applyArtifactBriefProposal, applyCanvasProposal, applyCanvasObjectProposal, canvasEditSchema, canvasObjectCreateSchema, MathProposalValidationError, moleculeProposalSchema, proposeArtifactBrief, proposeCanvasEdit, proposeCanvasObject, proposeMolecule, type ArtifactBriefProposal, type CanvasObjectProposal, type CanvasProposal } from "./tutor";
import { Atom, BookOpen, ChevronDown, Download, FileText, Link2, Plus, Redo2, Search, Tag, Trash2, Undo2, Upload, X } from "lucide-react";
import { formalCharge, vectorMagnitude, type Element } from "../science";
import { canvasTools, type CanvasTool } from "./registry";
import { bondOrderSum, createObject, emptyCanvasDocument, formalChargeForAtom, moleculeBonds, newId, parseCanvasDocument, type BondOrder, type CanvasDocument, type MoleculeAtom, type MoleculeBond, type ScientificObject } from "./model";
import { approveCanvasProposal, type CanvasProposal as ShapeProposal } from "./ai/canvas-actions";
import { artifactBriefSchema, type ArtifactBrief, type CompiledExampleState } from "./ai/teaching-scene";
import { ExamplePlayer } from "./replay/ExamplePlayer";
import { initPlayer, reducePlayer, stateAt, type PlayerEvent, type PlayerState } from "./replay/example-player";
import { buildBriefRepairResult, briefRepairSignature, checkBriefPreserve } from "./ai/author-repair";
import { ArtifactValidationError } from "../artifacts/contracts";
import type { PreserveList } from "../artifacts/repair-message";
import { boardOccupancy } from "./ai/canvas-context";
import { objectOccupancy, type LayoutRect } from "./ai/layout";
import { useQuickdrawAIBridge } from "./ai/canvas-bridge";
import { invalidateCanvasSceneCache, requestCanvasScene } from "./ai/scene-tools";
import { recognitionSourceKey, submitRecognitionFeedback, teachSelectedDrawing, type RecognitionFeedbackDecision } from "./ai/recognition-feedback";
import type { CanvasSceneNode } from "./spatial/types";
import { createMathWorkspaceState, tutorMathWorkspace } from "./math-workspace";
import { captureQuickdrawOCRRegions } from "./ocr-capture.js";
import { NarrationPanel } from "./NarrationPanel";
import { readPalmRejection, writePalmRejection, smoothCapturedPressure, smoothPenTrail, isScratchOut, isCircle, type PenPoint2D, type CircleGesture } from "./pen-input.js";

type CourseNote = { id: string; title: string; body: string };
type CourseDocument = { id: string; title: string };
type Board = { id: string; name: string; revision: number };
type PersistedBoard = { id: string; course_id: string; lesson_id: string; revision: number; document: string };
type ExampleSession = { exampleId: string; states: CompiledExampleState[]; player: PlayerState; mode: "replay" | "editing" };
type AnalysisTelemetry = { totalMs: number; imageEgress: boolean; usage: Array<{ provider: string; calls: number; promptTokens: number; completionTokens: number; costUsd: number }> };
type Props = { courseId: string; lessonId: string; theme: "light" | "dark"; onStatus: (status: string) => void; onOpenNote: (id: string) => void; onOpenDocument: (id: string, title: string) => void; onSummary: (summary: { objectCount: number; objectTypes: Record<string, number> }) => void; onSelectedObject?: (object: { id: string; name: string } | null) => void; preferredBoardId?: string; onBoardState?: (state: { id: string; revision: number; saved: boolean }) => void; activityMode?: boolean; focusCitation?: { ref: string; key: number } };

function selectedObjectName(object: ScientificObject): string {
  const fields = object as unknown as Record<string, unknown>;
  const name = ["label", "name", "title"].map((key) => fields[key]).find((value) => typeof value === "string" && value.trim());
  return typeof name === "string" ? name.trim().slice(0, 80) : object.kind;
}
const approveCanvasProposalAtRevision = approveCanvasProposal as unknown as (source: Store, activeBoardId: string, proposal: ShapeProposal, editor?: Editor, currentRevision?: number) => { changedId: string };
// Quickdraw's own tool shortcuts (editor.js toolKeys) switch tools without
// ending an active pointer session; match the set so we can close it first.
const TOOL_KEYS = new Set(["v", "1", "h", "d", "p", "b", "i", "e", "k", "a", "l", "t", "n", "g", "r", "o"]);

// Smoothing is applied once, at the documented onChange boundary when Quickdraw
// marks a draw stroke done. The write uses Store.update inside the still-open
// gesture batch (store.js:99-120,170-182), so undo stays one step and no document
// is written directly. The guard stops the resulting diff from re-entering.
function smoothCompletedInk(diff: Diff, editor: Editor, guard: { current: boolean }) {
  if (guard.current) return;
  let completed: ShapeRecord | undefined;
  for (const [, pair] of Object.entries(diff.updated ?? {})) {
    const next = pair[1];
    if (next?.typeName === "shape" && next.type === "draw" && next.props?.done === true) { completed = next; break; }
  }
  if (!completed) return;
  const pts = completed.props.pts;
  if (!Array.isArray(pts) || pts.length < 9 || !pts.every((value) => typeof value === "number" && Number.isFinite(value))) return;
  const smoothed = smoothCapturedPressure(pts);
  if (smoothed.every((value, index) => value === pts[index])) return;
  guard.current = true;
  try { editor.store.update(completed.id, { props: { pts: smoothed } }); }
  finally { guard.current = false; }
}

/**
 * Apply a recognised pen gesture through Quickdraw's own documented APIs.
 * `Store.transact`/`remove` and `Editor.setSelection` keep undo, persistence and
 * selection ownership where they already live; no document is written directly.
 */
function topInkId(editor: Editor): string | undefined {
  return editor.store.shapes().filter((shape) => shape.type === "draw").sort((a, b) => b.z - a.z)[0]?.id;
}

function applyPenGesture(kind: "scratch" | "circle", points: PenPoint2D[], circle: CircleGesture | null, editor: Editor) {
  const shapes = editor.store.shapes();
  // The gesture stroke Quickdraw committed on this pointer-up is the topmost ink.
  const gestureId = topInkId(editor);
  if (kind === "scratch") {
    const ids = new Set<string>();
    const tolerance = 8 / editor.camera.z;
    // hitShape (not hitTest): hitTest only returns the topmost shape, which is
    // the scratch stroke itself; we need every stroke the scribble crosses.
    for (const shape of shapes) {
      if (shape.id === gestureId) continue;
      if (points.some((point) => hitShape(shape, point.x, point.y, tolerance, editor.store))) ids.add(shape.id);
    }
    if (gestureId) ids.add(gestureId);
    if (ids.size) editor.store.transact(() => editor.store.remove([...ids]));
    return;
  }
  if (!circle) return;
  if (gestureId) editor.store.remove([gestureId]);
  const enclosed = editor.store.shapes().filter((shape) => {
    const bounds = pageBounds(shape);
    return [[bounds.x, bounds.y], [bounds.x + bounds.w, bounds.y], [bounds.x, bounds.y + bounds.h], [bounds.x + bounds.w, bounds.y + bounds.h]]
      .every(([x, y]) => Math.hypot(x - circle.center.x, y - circle.center.y) <= circle.radius);
  }).map((shape) => shape.id);
  editor.setSelection(enclosed);
}

/** Pull the most likely LaTeX reading out of the existing analysis evidence.
 * OCR evidence is preferred; an explicit model statement is the fallback. */
function latexFromAnalysis(analysis: CanvasAnalysisResult): string {
  const ocr = analysis.observedEvidence.items.find((item) => item.origin === "ocr" && item.text.trim());
  const statement = analysis.inferredInterpretations.items.find((item) => item.statement.trim())?.statement;
  let text = (ocr?.text ?? statement ?? "").trim();
  // Some OCR providers surface a JSON payload as the evidence text.
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as { items?: Array<{ text?: string }> };
      text = parsed.items?.find((item) => typeof item.text === "string")?.text ?? text;
    } catch { /* keep the raw reading */ }
  }
  return text.trim().slice(0, 500) || "\\text{unread handwriting}";
}

export function CanvasStudio({ courseId, lessonId, theme, onStatus, onOpenNote, onOpenDocument, onSummary, onSelectedObject, preferredBoardId, onBoardState, activityMode = false, focusCitation }: Props) {
  const quickdrawRef = useRef<QuickdrawRef>(null);
  const editorRef = useRef<Editor | null>(null);
  const editorListeners = useRef<Array<() => void>>([]);
  const boardRef = useRef<Board | null>(null);
  const documentRef = useRef<CanvasDocument>(emptyCanvasDocument());
  const objectHistory = useRef<{ undo: CanvasDocument[]; redo: CanvasDocument[] }>({ undo: [], redo: [] });
  const nativeGesture = useRef<CanvasDocument | null>(null);
  const latestChange = useRef<"drawing" | "objects">("drawing");
  const loadSequence = useRef(0);
  const saveTimer = useRef<number | undefined>(undefined);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const revisions = useRef(new Map<string, number>());
  const skipQuickdrawSave = useRef<unknown>(undefined);
  // Guards the documented Store.update smoothing write so its own diff cannot recurse.
  const pressureSmoothing = useRef(false);
  const [palmRejection, setPalmRejection] = useState(readPalmRejection);
  const palmRejectionRef = useRef(palmRejection);
  palmRejectionRef.current = palmRejection;
  const activePenPointer = useRef<number | null>(null);
  // A cancelled pen ends the session but Quickdraw arms penMode only once, so we
  // disarm it until the next pen contact instead of leaving touch blocked forever.
  const rearmPenModeOnNextPen = useRef(false);
  const gestureTrail = useRef<PenPoint2D[]>([]);
  const gesturePointerId = useRef<number | null>(null);
  const [lastPenGesture, setLastPenGesture] = useState<"none" | "scratch" | "circle">("none");
  const gestureStartedAt = useRef(0);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const boardElement = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [document, setDocument] = useState<CanvasDocument>(emptyCanvasDocument());
  const [loading, setLoading] = useState(true);
  const [toolOpen, setToolOpen] = useState(true);
  const [toolSearch, setToolSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [focusedId, setFocusedId] = useState<string>();
  const handledFocusKey = useRef(0);
  const [editingId, setEditingId] = useState<string>();
const [registeredCards, setRegisteredCards] = useState<string[]>([]);
  const [, setEditorFrame] = useState(0);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  const [boardMenu, setBoardMenu] = useState(false);
  const [proposal, setProposal] = useState<CanvasProposal>();
  const [objectProposal, setObjectProposal] = useState<CanvasObjectProposal>();
  const [recognitionOpen, setRecognitionOpen] = useState(false);
  const [recognitionBusy, setRecognitionBusy] = useState(false);
  const [teachLabel, setTeachLabel] = useState("");
  const [recognitionCandidates, setRecognitionCandidates] = useState<CanvasSceneNode[]>([]);
  const [exampleCounts, setExampleCounts] = useState<Record<string, number>>({});
  const [scienceMode, setScienceMode] = useState<ScienceMode>(null);
  const [placementPatch, setPlacementPatch] = useState<Partial<ScientificObject>>({});
  const [nativeTool, setNativeTool] = useState("select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [shapeProposal, setShapeProposal] = useState<ShapeProposal>();
  const [artifactProposal, setArtifactProposal] = useState<ArtifactBriefProposal>();
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [exampleSession, setExampleSession] = useState<ExampleSession>();
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [canvasAnalysis, setCanvasAnalysis] = useState<CanvasAnalysisResult>();
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisTelemetry, setAnalysisTelemetry] = useState<AnalysisTelemetry>();
  const [allowImageEgress, setAllowImageEgress] = useState(() => { try { return localStorage.getItem("studyai.canvas.imageEgress") !== "off"; } catch { return true; } });
  const [proposalBusy, setProposalBusy] = useState(false);
  useEffect(() => setToolOpen(!activityMode), [activityMode]);
  // Step descriptors are view state, not persisted board data; a board switch drops the rail.
  useEffect(() => { setExampleSession(undefined); }, [activeBoard?.id]);
  useAgentContext({ description: "StudyAI active scientific canvas objects", value: { boardId: activeBoard?.id ?? "", courseId, lessonId, objects: loading ? [] : document.objects.map((object) => object.kind === "equation" && object.mathWorkspace ? { ...object, mathWorkspace: tutorMathWorkspace(object.mathWorkspace) } : object), freehand: "Uninterpreted Quickdraw snapshot" } });
  const currentSelection = document.objects.find((object) => object.id === selectedId);
  useAgentContext({ description: "StudyAI selected scientific object", value: currentSelection ? { selected: true, objectId: currentSelection.id, name: selectedObjectName(currentSelection), kind: currentSelection.kind, boardId: activeBoard?.id ?? "", courseId, lessonId } : { selected: false, courseId, lessonId } });
  useEffect(() => { onSelectedObject?.(currentSelection ? { id: currentSelection.id, name: selectedObjectName(currentSelection) } : null); }, [currentSelection, onSelectedObject]);
  useEffect(() => {
    if (!focusCitation || focusCitation.key === handledFocusKey.current || loading || !activeBoard) return;
    const citation = parseCanvasCitation(focusCitation.ref);
    if (!citation) return;
    handledFocusKey.current = focusCitation.key;
    const object = citation.scope === "science" ? document.objects.find((item) => item.id === citation.id) : undefined;
    const record = citation.scope === "quickdraw" ? editorRef.current?.store.get(citation.id) : undefined;
    const shape = record?.typeName === "shape" ? record : undefined;
    const bounds = object ? { x: object.x, y: object.y, w: object.width, h: object.height } : shape ? pageBounds(shape) : undefined;
    if (!bounds || !editorRef.current) {
      setFocusedId(undefined);
      onStatus("That cited canvas item is no longer on this board.");
      return;
    }
    editorRef.current.setTool("select");
    editorRef.current.setSelection([citation.id]);
    if (object) setSelectedId(citation.id);
    setFocusedId(citation.id);
    editorRef.current.followBounds(bounds, { animate: 200 });
  }, [focusCitation, loading, activeBoard, document.objects, onStatus]);
  useFrontendTool({
    name: "propose_canvas_edit",
    description: "Consequential: requires user approval. Propose an edit to an existing scientific object on the active board. The user must apply it before it changes the canvas. Use current IDs from canvas context.",
    parameters: canvasEditSchema,
    handler: async (edit) => {
      try {
        const currentBoard = boardRef.current;
        if (!currentBoard) throw new Error("The active board is not ready.");
        const context = { boardId: currentBoard.id, courseId, lessonId, objects: documentRef.current.objects, revision: currentBoard.revision } as Parameters<typeof proposeCanvasEdit>[0] & { revision: number };
        const next = await proposeCanvasEdit(context, edit);
        setProposal(next);
        return { status: "pending_user_review", reason: next.reason };
      } catch (error) { return error instanceof MathProposalValidationError ? { status: error.status, error: error.message } : { status: "rejected", error: error instanceof Error ? error.message : "Invalid edit" }; }
    },
  }, [courseId, lessonId]);
  useFrontendTool({
    name: "propose_scientific_object",
    description: "Consequential: requires user approval. Propose adding one validated scientific object to the active board for user review. Provide kind, position, and a JSON field object; id and kind are assigned by the app. The object is not added until the user applies the proposal.",
    parameters: canvasObjectCreateSchema,
    handler: async (input) => {
      try {
        const currentBoard = boardRef.current;
        if (!currentBoard) throw new Error("The active board is not ready.");
        const next = proposeCanvasObject({ boardId: currentBoard.id, courseId, lessonId, revision: currentBoard.revision, objects: documentRef.current.objects }, input);
        setObjectProposal(next);
        return { status: "pending_user_review", kind: next.object.kind, reason: next.reason, requiresConfirmation: true };
      } catch (error) {
        return { status: "rejected", error: error instanceof Error ? error.message : "Invalid scientific object proposal." };
      }
    },
  }, [courseId, lessonId]);
  useFrontendTool({
    name: "propose_molecule",
    description: "Consequential: requires user approval. Propose a validated Lewis molecule. Provide atoms as {element, nonbondingElectrons} and bonds as zero-based atom indices with an order (1, 1.5, 2, or 3). IDs are assigned by the app; nothing is added until the user applies the proposal.",
    parameters: moleculeProposalSchema,
    handler: async (input) => {
      try {
        const currentBoard = boardRef.current;
        if (!currentBoard) throw new Error("The active board is not ready.");
        const next = proposeMolecule({ boardId: currentBoard.id, courseId, lessonId, revision: currentBoard.revision, objects: documentRef.current.objects }, input);
        setObjectProposal(next);
        return { status: "pending_user_review", kind: next.object.kind, reason: next.reason, requiresConfirmation: true };
      } catch (error) {
        return { status: "rejected", error: error instanceof Error ? error.message : "Invalid molecule proposal." };
      }
    },
  }, [courseId, lessonId]);

  type AuthorAttempt = { signature: string; attempts: number; preserve: PreserveList; brief: ArtifactBrief };
  const authorAttemptRef = useRef<AuthorAttempt | null>(null);

  /** The single authoring verb: the model states intent, this handler asks the planner for geometry. */
  const handleAuthorBoard = useCallback(async (input: unknown) => {
    const parsed = artifactBriefSchema.safeParse(input);
    const signature = parsed.success ? briefRepairSignature(parsed.data) : null;
    const previous = signature ? authorAttemptRef.current : null;
    const isRepeat = Boolean(previous && previous.signature === signature);
    try {
      if (isRepeat && previous && parsed.success) {
        const check = checkBriefPreserve(previous.brief, parsed.data, previous.preserve);
        if (!check.ok) {
          const error = `preserve-list: the repair changed ${check.changed.join(", ")}. Keep question text and citations unchanged.`;
          setArtifactError(error);
          setArtifactProposal(undefined);
          return {
            status: "rejected",
            error,
            repair: { messages: [], preserve: previous.preserve, attempt: 2, maxAttempts: 2 },
          };
        }
      }
      const board = boardRef.current;
      if (!board) throw new Error("The active board is not ready.");
      const store = editorRef.current?.store ?? null;
      const bounds = editorRef.current?.viewportPageBounds() ?? { x: 0, y: 0, w: 4000, h: 3000 };
      const viewport: LayoutRect = { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h };
      const anchors = new Map<string, LayoutRect>([["#clear-area", viewport]]);
      if (store) {
        for (const record of store.all()) {
          if (record.typeName !== "shape") continue;
          const shapeBounds = pageBounds(record);
          anchors.set(`#${record.id}`, { x: shapeBounds.x, y: shapeBounds.y, width: shapeBounds.w, height: shapeBounds.h });
        }
      }
      const proposal = proposeArtifactBrief({
        boardId: board.id, courseId, lessonId, revision: board.revision,
        objects: documentRef.current.objects,
        occupancy: [...(store ? boardOccupancy(store) : []), ...objectOccupancy(documentRef.current.objects)],
        viewport, anchors,
      }, input);
      authorAttemptRef.current = null;
      setArtifactError(null);
      setArtifactProposal(proposal);
      return { status: "pending_user_review", proposalId: proposal.id, description: proposal.description, requiresConfirmation: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid board artifact.";
      // The tool result keeps the structured report for the model; the student-facing panel shows prose only.
      setArtifactError(error instanceof ArtifactValidationError
        ? error.report.problems.map((problem) => `${problem.validator}: ${problem.message}`).join("\n")
        : message);
      setArtifactProposal(undefined);

      if (error instanceof ArtifactValidationError && parsed.success && signature && previous && isRepeat) {
        const limit = "The single allowed repair call still failed validation. No package was applied.";
        setArtifactError("Validation still fails after the allowed repair. Start a new authoring request.");
        return {
          status: "provider_call_limit",
          error: limit,
          repair: { messages: [], preserve: previous.preserve, attempt: 2, maxAttempts: 2 },
        };
      }
      if (error instanceof ArtifactValidationError && parsed.success && signature) {
        const result = buildBriefRepairResult(parsed.data, error.report);
        if (result.status === "needs_repair") {
          authorAttemptRef.current = { signature, attempts: 1, preserve: result.preserve, brief: parsed.data };
          return {
            status: "rejected",
            error: result.text,
            repair: { messages: result.messages, preserve: result.preserve, attempt: 1, maxAttempts: 2 },
          };
        }
      }
      return { status: "rejected", error: message };
    }
  }, [courseId, lessonId]);

  useFrontendTool({
    name: "author_board",
    description: "Consequential: requires user approval. ONE verb for composing learning content onto the board: a question with a figure, a problem set (count 1-8), a worked example or a review deck. Describe what the artifact must show and where it belongs relative to the board; never supply x/y. The app resolves geometry against real board occupancy. Citations must be exact sourceRef values you retrieved; invented refs are removed server-side. The whole artifact is applied in one review and is labelled generated, not verified.",
    parameters: artifactBriefSchema,
    handler: handleAuthorBoard,
  }, [handleAuthorBoard]);

  // Dev-only seam for the acceptance spec: the model's schema-shaped tool-call payload is fed to the
  // exact same registered handler. In production there is no global entry point.
  useEffect(() => {
    const host = window as Window & { __studyaiAuthorBoard?: typeof handleAuthorBoard };
    if (import.meta.env.DEV) host.__studyaiAuthorBoard = handleAuthorBoard;
    return () => { delete host.__studyaiAuthorBoard; };
  }, [handleAuthorBoard]);

  const filteredTools = useMemo(() => {
    const query = toolSearch.trim().toLowerCase();
    return canvasTools.filter((tool) => !query || `${tool.label} ${tool.description} ${tool.group}`.toLowerCase().includes(query));
  }, [toolSearch]);
  const recognitionGroups = useMemo(() => {
    const groups = new Map<string, CanvasSceneNode[]>();
    for (const node of recognitionCandidates) {
      const key = recognitionSourceKey(node.sourceRefs.filter((ref) => ref.scope === "quickdraw").map((ref) => ref.id));
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), node]);
    }
    return [...groups.entries()].map(([key, nodes]) => ({
      key,
      primary: [...nodes].sort((a, b) => Number(b.verificationStatus === "confirmed") - Number(a.verificationStatus === "confirmed") || (b.confidence ?? 0) - (a.confidence ?? 0))[0],
      count: nodes.length,
      confirmed: nodes.some((node) => node.verificationStatus === "confirmed"),
    }));
  }, [recognitionCandidates]);
  const selectedObject = document.objects.find((item) => item.id === editingId);

  useQuickdrawAIBridge({
    store: editorRef.current?.store ?? null,
    snapshot: document.snapshot,
    selectedIds: selectedShapeIds,
    viewport: editorRef.current?.viewportPageBounds() ?? { x: 0, y: 0, w: 1, h: 1 },
    objects: document.objects,
    scope: { boardId: activeBoard?.id ?? "", courseId, lessonId, revision: activeBoard?.revision ?? 0 } as never,
    onProposal: setShapeProposal,
  });

  const refreshHistory = useCallback(() => {
    const editor = editorRef.current;
    setUndoState({ canUndo: Boolean(objectHistory.current.undo.length), canRedo: Boolean(objectHistory.current.redo.length) });
  }, []);
  const cleanupEditor = useCallback(() => {
    editorListeners.current.forEach((unsubscribe) => unsubscribe());
    editorListeners.current = [];
    editorRef.current = null;
  }, []);

  const postDocument = useCallback((board: Board, next: CanvasDocument) => {
    const job = saveQueue.current.then(async () => {
      const expectedRevision = revisions.current.get(board.id) ?? board.revision;
      try {
        const response = await fetch(`${API}/canvases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: board.id, courseId, lessonId, name: board.name, expectedRevision, document: next }) });
        if (response.status === 409) {
          if (boardRef.current?.id === board.id) { onStatus("Canvas changed elsewhere. Reload the board before saving."); onBoardState?.({ id: board.id, revision: expectedRevision, saved: false }); }
          return false;
        }
        if (!response.ok) throw new Error("save failed");
        const result = await response.json() as { revision?: number };
        if (!Number.isInteger(result.revision) || result.revision! < expectedRevision) throw new Error("Canvas save returned an invalid revision.");
        revisions.current.set(board.id, result.revision!);
        const update = (current: Board) => current.id === board.id ? { ...current, revision: result.revision! } : current;
        setBoards((current) => current.map(update));
        setActiveBoard((current) => current?.id === board.id ? { ...current, revision: result.revision! } : current);
        if (boardRef.current?.id === board.id) {
          boardRef.current = { ...boardRef.current, revision: result.revision! };
          onBoardState?.({ id: board.id, revision: result.revision!, saved: stableJson(documentRef.current) === stableJson(next) });
          onStatus("All changes saved");
        }
        return true;
      } catch {
        if (boardRef.current?.id === board.id) { onStatus("Canvas save unavailable"); onBoardState?.({ id: board.id, revision: expectedRevision, saved: false }); }
        return false;
      }
    });
    saveQueue.current = job.then(() => undefined, () => undefined);
    return job;
  }, [courseId, lessonId, onBoardState, onStatus]);

  const scheduleSave = useCallback((board: Board | null, next: CanvasDocument) => {
    next = resolveScene(next);
    setCanvasAnalysis(undefined);
    documentRef.current = next;
    setDocument(next);
    if (!board) return;
    onBoardState?.({ id: board.id, revision: revisions.current.get(board.id) ?? board.revision, saved: false });
    onStatus("Savingâ€¦");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void postDocument(board, next), 400);
  }, [onBoardState, onStatus, postDocument]);

  useEffect(() => {
    if (loading || !document.objects.some((object) => object.kind === "graph" || object.kind === "equation")) return;
    let live = true;
    const before = documentRef.current;
    void evaluateScientificObjects(before.objects).then((objects) => {
      if (live && documentRef.current === before && JSON.stringify(objects) !== JSON.stringify(before.objects)) scheduleSave(boardRef.current, { ...before, objects });
    });
    return () => { live = false; };
  }, [document.objects, loading, scheduleSave]);

  const currentDocument = useCallback(() => {
    const liveSnapshot = editorRef.current?.store.getSnapshot();
    return liveSnapshot ? { ...documentRef.current, snapshot: liveSnapshot } : documentRef.current;
  }, []);

  const saveNow = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const board = boardRef.current;
    if (!board || loading) return false;
    return postDocument(board, currentDocument());
  }, [currentDocument, loading, postDocument]);

  const readAuthoritativeBoard = useCallback(async (board: Board) => {
    const response = await fetch(`${API}/canvases/${encodeURIComponent(board.id)}?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`);
    if (!response.ok) throw new Error("The saved board revision is unavailable.");
    const row = await response.json() as PersistedBoard;
    if (row.id !== board.id || row.course_id !== courseId || row.lesson_id !== lessonId || !Number.isInteger(row.revision)) throw new Error("The saved board scope does not match the active course and lesson.");
    const persistedValue = typeof row.document === "string" ? JSON.parse(row.document) : row.document;
    const persistedDocument = resolveScene(parseCanvasDocument(persistedValue));
    const localDocument = currentDocument();
    if (stableJson(persistedDocument) !== stableJson(localDocument)) throw new Error("The board changed elsewhere. Reload it before continuing.");
    if (boardRef.current?.id !== board.id) throw new Error("The active board changed. Try again on the current board.");
    revisions.current.set(board.id, row.revision);
    const currentBoard = { ...board, revision: row.revision };
    boardRef.current = currentBoard;
    setActiveBoard(currentBoard);
    setBoards((current) => current.map((item) => item.id === board.id ? currentBoard : item));
    return { revision: row.revision, document: persistedDocument };
  }, [courseId, currentDocument, lessonId]);

  const analyzeBoard = useCallback(async (onResult?: (analysis: CanvasAnalysisResult) => void) => {
    const board = boardRef.current;
    const editor = editorRef.current;
    if (!board || !editor || loading || analysisBusy || proposalBusy) return;
    const sequence = loadSequence.current;
    const requestDocument = structuredClone(currentDocument());
    const selectedIds = [...new Set([...selectedShapeIds, ...(selectedId ? [selectedId] : [])])];
    setCanvasAnalysis(undefined);
    setAnalysisTelemetry(undefined);
    setAnalysisBusy(true);
    try {
      if (!await saveNow()) throw new Error("Save the active board before analysis.");
      const persisted = await readAuthoritativeBoard(board);
      if (stableJson(persisted.document) !== stableJson(requestDocument)) throw new Error("The board changed while saving. Analyze again.");
      const regions = await captureQuickdrawOCRRegions(editor, selectedIds, documentRef.current.objects);
      if (sequence !== loadSequence.current || boardRef.current?.id !== board.id || stableJson(currentDocument()) !== stableJson(requestDocument)) throw new Error("The board changed during analysis setup. Try again.");
      const response = await fetch(`${API}/canvases/${encodeURIComponent(board.id)}/analysis?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: persisted.revision, document: requestDocument, selectedIds, allowImageEgress, image: { regions } }),
      });
      const body = await response.json() as { analysis?: CanvasAnalysisResult; telemetry?: AnalysisTelemetry; error?: string };
      if (!response.ok || !body.analysis) throw new Error(body.error ?? "Canvas analysis failed.");
      if (body.analysis.boardId !== board.id || body.analysis.courseId !== courseId || body.analysis.lessonId !== lessonId || body.analysis.revision !== persisted.revision) throw new Error("Canvas analysis returned a mismatched or stale board revision.");
      if (sequence !== loadSequence.current || boardRef.current?.id !== board.id || stableJson(currentDocument()) !== stableJson(requestDocument)) throw new Error("The board changed while analysis was running. Analyze the current board again.");
      setCanvasAnalysis(body.analysis);
      setAnalysisTelemetry(body.telemetry);
      onStatus(body.analysis.omittedRegions.length ? `Canvas analysis is partial; ${body.analysis.omittedRegions.length} ink region(s) were omitted.` : body.analysis.analysisStatus === "partial" ? "Canvas analysis is partial; some ink regions may be unprocessed." : "Canvas analysis is ready for the Tutor");
      onResult?.(body.analysis);
    } catch (error) {
      setCanvasAnalysis(undefined);
      setAnalysisTelemetry(undefined);
      onStatus(error instanceof Error ? error.message : "Canvas analysis failed");
    } finally { setAnalysisBusy(false); }
  }, [allowImageEgress, analysisBusy, courseId, currentDocument, lessonId, loading, onStatus, proposalBusy, readAuthoritativeBoard, saveNow, selectedId, selectedShapeIds]);

  const applyTutorProposal = useCallback(async () => {
    const board = boardRef.current;
    const pending = proposal;
    if (!board || !pending || proposalBusy) return;
    setProposalBusy(true);
    try {
      const sequence = loadSequence.current;
      const base = structuredClone(currentDocument());
      const authoritative = await readAuthoritativeBoard(board);
      if (stableJson(currentDocument()) !== stableJson(base)) throw new Error("The board changed while the proposal was being checked.");
      const context = { boardId: board.id, courseId, lessonId, objects: base.objects, revision: authoritative.revision } as Parameters<typeof applyCanvasProposal>[0] & { revision: number };
      const objects = await applyCanvasProposal(context, pending);
      const next = resolveScene({ ...base, objects });
      if (stableJson(currentDocument()) !== stableJson(base)) throw new Error("The board changed while the proposal was being checked.");
      if (!await postDocument({ ...board, revision: authoritative.revision }, next)) return;
      if (sequence !== loadSequence.current || boardRef.current?.id !== board.id || stableJson(currentDocument()) !== stableJson(base)) throw new Error("The active board changed before the approved edit could be shown.");
      objectHistory.current.undo.push(base); objectHistory.current.redo = [];
      documentRef.current = next;
      setDocument(next);
      setCanvasAnalysis(undefined);
      setProposal(undefined);
      refreshHistory();
    } catch (error) { onStatus(error instanceof Error ? error.message : "Could not apply canvas proposal"); }
    finally { setProposalBusy(false); }
  }, [courseId, currentDocument, lessonId, onStatus, postDocument, proposal, proposalBusy, readAuthoritativeBoard, refreshHistory]);

  const applyQuickdrawProposal = useCallback(async () => {
    const board = boardRef.current;
    const pending = shapeProposal;
    if (!board || !pending || proposalBusy) return;
    setProposalBusy(true);
    try {
      const sequence = loadSequence.current;
      const base = structuredClone(currentDocument());
      const authoritative = await readAuthoritativeBoard(board);
      if (stableJson(currentDocument()) !== stableJson(base)) throw new Error("The board changed while the proposal was being checked.");
      const preview = new Store();
      preview.loadSnapshot(base.snapshot);
      approveCanvasProposalAtRevision(preview, board.id, pending, undefined, authoritative.revision);
      const next = { ...base, snapshot: preview.getSnapshot() };
      const changesBoard = pending.actions.some((action) => action.kind !== "selectShapes");
      if (changesBoard) {
        if (stableJson(currentDocument()) !== stableJson(base)) throw new Error("The board changed while the proposal was being checked.");
        if (!await postDocument({ ...board, revision: authoritative.revision }, next)) return;
      }
      const editor = editorRef.current;
      if (!editor || boardRef.current?.id !== board.id || sequence !== loadSequence.current || stableJson(currentDocument()) !== stableJson(base)) throw new Error("The active board changed before the proposal could be applied.");
      if (changesBoard) skipQuickdrawSave.current = next.snapshot;
      approveCanvasProposalAtRevision(editor.store, board.id, pending, editor, authoritative.revision);
      if (changesBoard) { documentRef.current = next; setDocument(next); }
      setCanvasAnalysis(undefined);
      setShapeProposal(undefined);
    } catch (error) { onStatus(error instanceof Error ? error.message : "Could not apply canvas proposal"); }
    finally { setProposalBusy(false); }
  }, [currentDocument, onStatus, postDocument, proposalBusy, readAuthoritativeBoard, shapeProposal]);

  const applyObjectProposal = useCallback(async () => {
    const board = boardRef.current;
    const pending = objectProposal;
    if (!board || !pending || proposalBusy) return;
    setProposalBusy(true);
    try {
      const sequence = loadSequence.current;
      const base = structuredClone(currentDocument());
      const authoritative = await readAuthoritativeBoard(board);
      if (stableJson(currentDocument()) !== stableJson(base)) throw new Error("The board changed while the proposal was being checked.");
      const context = { boardId: board.id, courseId, lessonId, objects: base.objects, revision: authoritative.revision };
      const objects = applyCanvasObjectProposal(context, pending);
      const next = resolveScene({ ...base, objects });
      if (!await postDocument({ ...board, revision: authoritative.revision }, next)) return;
      if (sequence !== loadSequence.current || boardRef.current?.id !== board.id || stableJson(currentDocument()) !== stableJson(base)) throw new Error("The active board changed before the approved object could be shown.");
      objectHistory.current.undo.push(base); objectHistory.current.redo = [];
      documentRef.current = next;
      setDocument(next);
      setCanvasAnalysis(undefined);
      setObjectProposal(undefined);
      refreshHistory();
      onStatus("Scientific object added");
    } catch (error) { onStatus(error instanceof Error ? error.message : "Could not add scientific object"); }
    finally { setProposalBusy(false); }
  }, [courseId, currentDocument, lessonId, objectProposal, onStatus, postDocument, proposalBusy, readAuthoritativeBoard, refreshHistory]);

  /** Applies the whole artifact bundle as one document write: one revision bump, one undo step. */
  const applyArtifactProposal = useCallback(async () => {
    const board = boardRef.current;
    const pending = artifactProposal;
    if (!board || !pending || proposalBusy) return;
    setProposalBusy(true);
    try {
      const sequence = loadSequence.current;
      const base = structuredClone(currentDocument());
      const authoritative = await readAuthoritativeBoard(board);
      if (stableJson(currentDocument()) !== stableJson(base)) throw new Error("The board changed while the artifact was being checked.");
      const context = { boardId: board.id, courseId, lessonId, objects: base.objects, revision: authoritative.revision };
      const objects = applyArtifactBriefProposal(context, pending);
      const next = resolveScene({ ...base, objects });
      if (stableJson(currentDocument()) !== stableJson(base)) throw new Error("The board changed while the artifact was being checked.");
      if (!await postDocument({ ...board, revision: authoritative.revision }, next)) return;
      if (sequence !== loadSequence.current || boardRef.current?.id !== board.id || stableJson(currentDocument()) !== stableJson(base)) throw new Error("The active board changed before the artifact could be shown.");
      objectHistory.current.undo.push(base); objectHistory.current.redo = [];
      documentRef.current = next; setDocument(next); setCanvasAnalysis(undefined);
      setArtifactProposal(undefined); refreshHistory();
      // The applied proposal carries compiler-produced states; the rail is view state only.
      setExampleSession(pending.states?.length ? { exampleId: pending.id, states: pending.states, player: initPlayer(pending.id), mode: "replay" } : undefined);
      onStatus("Artifact added to the board");
    } catch (error) { onStatus(error instanceof Error ? error.message : "Could not add the artifact"); }
    finally { setProposalBusy(false); }
  }, [courseId, currentDocument, lessonId, artifactProposal, onStatus, postDocument, proposalBusy, readAuthoritativeBoard, refreshHistory]);

  const refreshRecognition = useCallback(async () => {
    const board = activeBoard;
    if (!board) return;
    try {
      const graph = await requestCanvasScene({ boardId: board.id, courseId, lessonId, revision: board.revision });
      setRecognitionCandidates(graph.nodes.filter((node) => node.kind === "recognition-candidate"));
      const response = await fetch(`${API}/canvas-recognition/examples?course=${encodeURIComponent(courseId)}`);
      if (response.ok) setExampleCounts((await response.json() as { labels?: Record<string, number> }).labels ?? {});
    } catch {
      setRecognitionCandidates([]);
    }
  }, [activeBoard, courseId, lessonId]);

  const openRecognition = useCallback(async () => {
    if (recognitionOpen) { setRecognitionOpen(false); return; }
    setRecognitionOpen(true);
    await refreshRecognition();
  }, [recognitionOpen, refreshRecognition]);

  const teachSelection = useCallback(async () => {
    const board = boardRef.current;
    const label = teachLabel.trim();
    if (!board || !label || !selectedShapeIds.length || recognitionBusy) return;
    setRecognitionBusy(true);
    try {
      const result = await teachSelectedDrawing({ boardId: board.id, courseId, lessonId }, selectedShapeIds, label);
      setTeachLabel("");
      invalidateCanvasSceneCache();
      await refreshRecognition();
      onStatus(`Taught â€œ${result.label}â€ (${result.examples} example${result.examples === 1 ? "" : "s"})`);
    } catch (error) { onStatus(error instanceof Error ? error.message : "Teaching failed"); }
    finally { setRecognitionBusy(false); }
  }, [courseId, lessonId, onStatus, recognitionBusy, refreshRecognition, selectedShapeIds, teachLabel]);

  const reviewCandidate = useCallback(async (node: CanvasSceneNode, decision: RecognitionFeedbackDecision, label?: string) => {
    const board = boardRef.current;
    const strokeIds = node.sourceRefs.filter((ref) => ref.scope === "quickdraw").map((ref) => ref.id);
    if (!board || !strokeIds.length || recognitionBusy) return;
    setRecognitionBusy(true);
    try {
      const result = await submitRecognitionFeedback({ boardId: board.id, courseId, lessonId }, { strokeIds, decision, ...(label ? { label } : {}) });
      invalidateCanvasSceneCache();
      await refreshRecognition();
      const suffix = result.warnings.length ? ` ${result.warnings[0]}` : "";
      onStatus(`${decision === "accept" ? "Label accepted" : decision === "correct" ? "Correction saved" : "Candidate dismissed"}${suffix}`);
    } catch (error) { onStatus(error instanceof Error ? error.message : "Recognition feedback failed"); }
    finally { setRecognitionBusy(false); }
  }, [courseId, lessonId, onStatus, recognitionBusy, refreshRecognition]);

  const correctionPrompt = async (node: CanvasSceneNode) => {
    const label = window.prompt("Correct label for this drawing (leave empty to just dismiss):", node.text ?? "");
    if (label === null) return;
    if (label.trim()) await reviewCandidate(node, "correct", label.trim());
    else await reviewCandidate(node, "reject");
  };

  const loadBoard = useCallback(async (board: Board) => {
    const sequence = ++loadSequence.current;
    window.clearTimeout(saveTimer.current);
    cleanupEditor();
    setLoading(true);
    setActiveBoard(board);
    boardRef.current = board;
    onBoardState?.({ id: board.id, revision: board.revision, saved: false });
    setCanvasAnalysis(undefined);
    setShapeProposal(undefined);
    setSelectedId(undefined);
    setEditingId(undefined);
    setScienceMode(null);
    objectHistory.current = { undo: [], redo: [] };
    latestChange.current = "drawing";
    setUndoState({ canUndo: false, canRedo: false });
    try {
      const response = await fetch(`${API}/canvases/${encodeURIComponent(board.id)}?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`);
      if (!response.ok) throw new Error("load failed");
      const row = await response.json() as PersistedBoard;
      if (row.id !== board.id || row.course_id !== courseId || row.lesson_id !== lessonId || !Number.isInteger(row.revision)) throw new Error("Canvas scope mismatch");
      const next = resolveScene(parseCanvasDocument(JSON.parse(row.document)));
      if (sequence !== loadSequence.current) return;
      const currentBoard = { ...board, revision: row.revision };
      revisions.current.set(board.id, row.revision);
      boardRef.current = currentBoard;
      setActiveBoard(currentBoard);
      setBoards((current) => current.map((item) => item.id === board.id ? currentBoard : item));
      onBoardState?.({ id: currentBoard.id, revision: currentBoard.revision, saved: true });
      documentRef.current = next;
      setDocument(next);
      void fetch(`${API}/canvases/${encodeURIComponent(currentBoard.id)}/analysis?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`)
        .then(async (response) => response.ok ? response.json() as Promise<{ analysis?: CanvasAnalysisResult | null }> : null)
        .then((value) => {
          if (sequence !== loadSequence.current || !value?.analysis) return;
          setCanvasAnalysis(value.analysis);
          onStatus("Canvas analysis restored for this board");
        })
        .catch(() => { /* no stored analysis; the user can run Analyze board */ });
    } catch {
      if (sequence !== loadSequence.current) return;
      const next = emptyCanvasDocument();
      documentRef.current = next;
      setDocument(next);
      onBoardState?.({ id: board.id, revision: board.revision, saved: false });
      onStatus("Canvas could not be loaded");
    } finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [cleanupEditor, onBoardState, onStatus, courseId, lessonId]);

  useEffect(() => {
    let live = true;
    ++loadSequence.current;
    revisions.current.clear();
    setLoading(true);
    setProposal(undefined);
    setShapeProposal(undefined);
    setCanvasAnalysis(undefined);
    setSelectedShapeIds([]);
    setActiveBoard(null);
    boardRef.current = null;
    cleanupEditor();
    documentRef.current = emptyCanvasDocument();
    setDocument(documentRef.current);
    objectHistory.current = { undo: [], redo: [] };
    latestChange.current = "drawing";
    setSelectedId(undefined); setEditingId(undefined); setUndoState({ canUndo: false, canRedo: false });
    const init = async () => {
      try {
        const response = await fetch(`${API}/canvases?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`);
        if (!response.ok) throw new Error("list failed");
        const rows = await response.json() as Array<{ id: string; name: string; revision: number }>;
        if (!live) return;
        if (rows.length) {
          const available = rows.map((row) => ({ id: row.id, name: row.name, revision: row.revision }));
          available.forEach((board) => revisions.current.set(board.id, board.revision));
          setBoards(available);
          await loadBoard(available.find((board) => board.id === preferredBoardId) ?? available[0]);
          return;
        }
        let initial = emptyCanvasDocument();
        try {
          const legacyResponse = await fetch(`${API}/drawings?course=${encodeURIComponent(courseId)}`);
          const legacy = legacyResponse.ok ? await legacyResponse.json() : null;
          if (legacy?.snapshot) initial = parseCanvasDocument(JSON.parse(legacy.snapshot));
        } catch { /* A new board can start empty when no legacy drawing exists. */ }
        if (!live) return;
        const created = { id: newId("canvas"), name: "Board 1", revision: 0 };
        const save = await fetch(`${API}/canvases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: created.id, name: created.name, courseId, lessonId, expectedRevision: 0, document: initial }) });
        if (!save.ok) throw new Error("create failed");
        const body = await save.json() as { id?: string; revision?: number };
        if (!body.id || !Number.isInteger(body.revision) || body.revision! < 1) throw new Error("Canvas creation did not return its revision.");
        created.id = body.id;
        created.revision = body.revision!;
        if (!live) return;
        revisions.current.set(created.id, created.revision);
        setBoards([created]);
        boardRef.current = created;
        setActiveBoard(created);
        onBoardState?.({ id: created.id, revision: created.revision, saved: true });
        documentRef.current = initial;
        setDocument(initial);
        setLoading(false);
      } catch {
        if (!live) return;
        setBoards([]);
        revisions.current.clear();
        setDocument(emptyCanvasDocument());
        setLoading(false);
        onStatus("Canvas storage unavailable");
      }
    };
    void init();
    return () => {
      live = false;
      ++loadSequence.current;
      window.clearTimeout(saveTimer.current);
      const board = boardRef.current;
      const next = currentDocument();
      if (board) void postDocument(board, next);
      cleanupEditor();
    };
  }, [courseId, lessonId, preferredBoardId, cleanupEditor, currentDocument, loadBoard, onBoardState, onStatus, postDocument]);

  useEffect(() => {
    const counts = document.objects.reduce<Record<string, number>>((acc, object) => { acc[object.kind] = (acc[object.kind] ?? 0) + 1; return acc; }, {});
    onSummary({ objectCount: document.objects.length, objectTypes: counts });
  }, [document.objects, onSummary]);

  const onMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setNativeTool(editor.tool);
    const unlistenHistory = editor.store.listenHistory(refreshHistory);
    const unlistenCamera = editor.on("camera", () => setEditorFrame((frame) => frame + 1));
    const unlistenTool = editor.on("tool", () => { setNativeTool(editor.tool); setScienceMode(null); });
    const unlistenSelection = editor.on("selection", () => {
      setSelectedShapeIds([...editor.selection]);
      if (editor.selection.size) setSelectedId(undefined);
    });
    // Quickdraw auto-arms pen mode on the first stylus contact (editor.js:451-455).
    // When the user opted out, undo that arm through the same public API — the
    // documented penmode event is the only place it can be caught without patching.
    const unlistenPenMode = editor.on("penmode", () => {
      if (!palmRejectionRef.current && editor.penMode) editor.setPenMode(false);
    });
    editorListeners.current.push(unlistenHistory, unlistenCamera, unlistenTool, unlistenSelection, unlistenPenMode);
    setEditorFrame((frame) => frame + 1);
    refreshHistory();
  }, [refreshHistory]);

  const togglePalmRejection = useCallback((on: boolean) => {
    setPalmRejection(on);
    palmRejectionRef.current = on;
    writePalmRejection(on);
    if (!on) editorRef.current?.setPenMode(false);
  }, []);

  // Double-tap does not touch the document: it runs the same OCR/analysis
  // request as the Analyze button and turns the result into an approval-gated
  // object proposal. Declining simply clears the proposal.
  const requestHandwritingLatex = useCallback((point: PenPoint2D) => {
    const board = boardRef.current;
    if (!board || loading || analysisBusy || proposalBusy) return;
    onStatus("Reading double-tapped handwriting…");
    void analyzeBoard((analysis) => {
      try {
        const latex = latexFromAnalysis(analysis);
        const context = { boardId: board.id, courseId, lessonId, revision: board.revision, objects: documentRef.current.objects };
        setObjectProposal(proposeCanvasObject(context, {
          boardId: board.id,
          kind: "equation",
          x: point.x,
          y: point.y,
          fieldsJson: JSON.stringify({ expression: latex }),
          reason: `Double-tapped handwriting read as LaTeX: ${latex}. Review before adding it to the board.`,
        }));
        onStatus("LaTeX proposal ready for review");
      } catch (error) { onStatus(error instanceof Error ? error.message : "Could not build the LaTeX proposal"); }
    });
  }, [analyzeBoard, analysisBusy, courseId, lessonId, loading, proposalBusy, onStatus]);

  const handleQuickdrawChange = useCallback((diff: Diff, source: DiffSource, editor: Editor) => {
    if (source !== "user") return;
    smoothCompletedInk(diff, editor, pressureSmoothing);
    if (skipQuickdrawSave.current) {
      const expected = skipQuickdrawSave.current;
      skipQuickdrawSave.current = undefined;
      if (stableJson(editor.store.getSnapshot()) === stableJson(expected)) return;
    }
    if (!nativeGesture.current) { objectHistory.current.undo.push(structuredClone(documentRef.current)); objectHistory.current.redo = []; }
    latestChange.current = "drawing";
    scheduleSave(boardRef.current, { ...documentRef.current, snapshot: editor.store.getSnapshot() });
    refreshHistory();
  }, [refreshHistory, scheduleSave]);

  // Any real object edit pauses replay. Take over and navigation are mode/view changes only:
  // neither writes the board, and the next edit uses the normal single-revision save path.
  const pauseExample = useCallback(() => {
    setExampleSession((current) => current?.player.playing ? { ...current, player: { ...current.player, playing: false } } : current);
  }, []);
  const handleExampleEvent = useCallback((event: PlayerEvent) => {
    setExampleSession((current) => current ? { ...current, player: reducePlayer(current.player, event, current.states.length) } : current);
  }, []);
  const handleTakeover = useCallback(() => {
    setExampleSession((current) => current ? { ...current, mode: "editing", player: { ...current.player, playing: false } } : current);
    onStatus("Worked example taken over — edit the objects directly");
  }, [onStatus]);

  const replaceObjects = useCallback((objects: ScientificObject[], trackHistory = true) => {
    pauseExample();
    if (trackHistory) {
      objectHistory.current.undo.push(structuredClone(currentDocument()));
      objectHistory.current.redo = [];
    }
    latestChange.current = "objects";
    scheduleSave(boardRef.current, { ...currentDocument(), objects });
    refreshHistory();
  }, [currentDocument, pauseExample, refreshHistory, scheduleSave]);

  const updateObject = useCallback((id: string, update: Partial<ScientificObject>, trackHistory = true) => {
    const next = documentRef.current.objects.map((object) => object.id === id ? { ...object, ...update } as ScientificObject : object);
    replaceObjects(next.map((object) => synchronizeObject(documentRef.current.objects.find((old) => old.id === object.id) ?? object, object)), trackHistory);
  }, [replaceObjects]);

  const createLinkedGraph = useCallback((equationId: string) => {
    const equation = documentRef.current.objects.find((item) => item.id === equationId);
    if (equation?.kind !== "equation" || !equation.mathWorkspace) return;
    const graph = createObject("graph", equation.x + 250, equation.y + 20);
    if (graph.kind !== "graph") return;
    graph.sourceEquationId = equation.id;
    graph.expression = equation.expression;
    graph.xRange = [-10, 10];
    const updatedEquation = { ...equation, mathWorkspace: { ...equation.mathWorkspace, dependencies: [...new Set([...equation.mathWorkspace.dependencies, graph.id])] } };
    replaceObjects(documentRef.current.objects.map((item) => item.id === equation.id ? updatedEquation : item).concat(graph));
    setEditingId(undefined);
  }, [replaceObjects]);

  const restoreDocument = useCallback((next: CanvasDocument) => {
    editorRef.current?.store.loadSnapshot(next.snapshot, "remote");
    scheduleSave(boardRef.current, next);
    setSelectedId(undefined); setEditingId(undefined); refreshHistory();
  }, [refreshHistory, scheduleSave]);
  const undo = useCallback(() => {
    const previous = objectHistory.current.undo.pop();
    if (!previous) return;
    objectHistory.current.redo.push(structuredClone(currentDocument()));
    restoreDocument(previous);
  }, [currentDocument, restoreDocument]);
  const redo = useCallback(() => {
    const next = objectHistory.current.redo.pop();
    if (!next) return;
    objectHistory.current.undo.push(structuredClone(currentDocument()));
    restoreDocument(next);
  }, [currentDocument, restoreDocument]);
  const finishNativeGesture = () => {
    const before = nativeGesture.current;
    if (!before) return;
    window.setTimeout(() => {
      if (nativeGesture.current === before) nativeGesture.current = null;
      if (JSON.stringify(before.snapshot) !== JSON.stringify(currentDocument().snapshot)) {
        objectHistory.current.undo.push(before); objectHistory.current.redo = []; refreshHistory();
      }
    }, 0);
  };

  // Quickdraw's setTool() leaves its live pointer session running, so a pan or
  // stroke started before a tool switch keeps consuming moves under the old
  // tool. End it through Quickdraw's public pointercancel input path first.
  const cancelNativeGesture = useCallback(() => {
    if (!nativeGesture.current) return;
    quickdrawRef.current?.editor?.container.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, pointerType: "mouse", bubbles: true }));
    nativeGesture.current = null;
  }, []);

  const activatePlacement = useCallback((kind: ScientificObject["kind"], patch: Partial<ScientificObject> = {}) => {
    cancelNativeGesture();
    editorRef.current?.setTool("select"); setScienceMode(kind); setPlacementPatch(patch); setToolOpen(kind === "molecule"); setEditingId(undefined); setSelectedId(undefined);
  }, [cancelNativeGesture]);

  const useTool = useCallback(async (tool: CanvasTool) => {
    const sequence = loadSequence.current;
    if (tool.action === "quickdraw") {
      setScienceMode(null);
      cancelNativeGesture();
      quickdrawRef.current?.editor?.setTool(tool.tool);
      setToolOpen(false);
      return;
    }
    if (tool.id === "linked-note") {
      try {
        const rows = await fetch(`${API}/notes?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`).then((response) => { if (!response.ok) throw new Error("Notes unavailable"); return response.json(); }) as CourseNote[];
        let note = rows[0];
        if (!note) {
          const created = await fetch(`${API}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, lessonId, title: "Canvas note", body: "" }) }).then((response) => { if (!response.ok) throw new Error("Note creation failed"); return response.json(); });
          note = { id: created.id, title: "Canvas note", body: "" };
        }
        if (sequence === loadSequence.current) activatePlacement("linked-note", { noteId: note.id, title: note.title, excerpt: note.body.slice(0, 180) } as Partial<ScientificObject>);
      } catch { onStatus("Course notes are unavailable"); }
      return;
    }
    if (tool.id === "linked-document") {
      try {
        const data = await fetch(`${API}/document-intelligence/documents?course=${encodeURIComponent(courseId)}`).then((response) => response.json()) as { documents: CourseDocument[] };
        const item = data.documents[0];
        if (!item) { onStatus("Import a course document before linking it"); return; }
        if (sequence === loadSequence.current) activatePlacement("linked-document", { documentId: item.id, title: item.title } as Partial<ScientificObject>);
      } catch { onStatus("Course documents are unavailable"); }
      return;
    }
    activatePlacement(tool.id);
  }, [activatePlacement, cancelNativeGesture, courseId, lessonId, onStatus]);

  const createBoard = useCallback(async () => {
    const nextName = `Board ${boards.length + 1}`;
    const nextDocument = emptyCanvasDocument();
    const id = newId("canvas");
    try {
      if (!await saveNow()) throw new Error("Save the current board before creating another board.");
      const response = await fetch(`${API}/canvases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, courseId, lessonId, name: nextName, expectedRevision: 0, document: nextDocument }) });
      if (!response.ok) throw new Error("create failed");
      const result = await response.json() as { revision?: number };
      if (!Number.isInteger(result.revision) || result.revision! < 1) throw new Error("Canvas creation did not return its revision.");
      const board = { id, name: nextName, revision: result.revision! };
      revisions.current.set(id, board.revision);
      setBoards((items) => [board, ...items]);
      await loadBoard(board); setBoardMenu(false);
    } catch { onStatus("Could not create a board"); }
  }, [boards.length, courseId, lessonId, loadBoard, onStatus, saveNow]);

  const changeBoard = useCallback(async (id: string) => {
    const board = boards.find((item) => item.id === id);
    if (!board || board.id === activeBoard?.id) return;
    if (!await saveNow()) { onStatus("The current board could not be saved. It remains open."); return; }
    await loadBoard(board);
    setBoardMenu(false);
  }, [activeBoard?.id, boards, loadBoard, onStatus, saveNow]);

  const deleteBoard = useCallback(async () => {
    if (!activeBoard || boards.length < 2 || !window.confirm(`Delete â€œ${activeBoard.name}â€?`)) return;
    if (!await saveNow()) { onStatus("The current board could not be saved. It remains open."); return; }
    await fetch(`${API}/canvases/${encodeURIComponent(activeBoard.id)}?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`, { method: "DELETE" });
    revisions.current.delete(activeBoard.id);
    const remaining = boards.filter((board) => board.id !== activeBoard.id);
    setBoards(remaining);
    await loadBoard(remaining[0]);
  }, [activeBoard, boards, loadBoard, courseId, lessonId, onStatus, saveNow]);

  const exportJson = useCallback(() => {
    if (!activeBoard) return;
    const blob = new Blob([JSON.stringify(currentDocument(), null, 2)], { type: "application/json" });
    download(blob, `${safeName(activeBoard.name)}.studycanvas.json`);
  }, [activeBoard, currentDocument]);

  const exportPng = useCallback(async () => {
    const blob = await editorRef.current?.exportImage({ background: true, scale: 2 });
    if (blob) download(blob, `${safeName(activeBoard?.name ?? "canvas")}.png`);
  }, [activeBoard?.name]);

  const importJson = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      const next = resolveScene(parseCanvasDocument(JSON.parse(await file.text())));
      if (!window.confirm("Replace this board with the imported canvas?")) return;
      editorRef.current?.store.loadSnapshot(next.snapshot);
      scheduleSave(boardRef.current, next);
      setSelectedId(undefined);
      onStatus("Canvas imported");
    } catch (error) { onStatus(error instanceof Error ? error.message : "Canvas import failed"); }
    finally { if (importRef.current) importRef.current.value = ""; }
  }, [onStatus, scheduleSave]);

  const exampleState = exampleSession?.mode === "replay" ? stateAt(exampleSession.states, exampleSession.player.stepIndex) : undefined;
  const dimmedIds = exampleState ? new Set(document.objects.map((object) => object.id).filter((id) => !exampleState.objectIds.includes(id))) : undefined;
  const highlightIds = focusedId ? new Set([focusedId]) : exampleState ? new Set(exampleState.highlightIds) : undefined;

  return <div className="canvas-studio">
    {canvasAnalysis && <CanvasAnalysisTutorContext analysis={canvasAnalysis} />}
    {proposal && <section className="canvas-proposal" role="region" aria-label="Tutor canvas proposal"><strong>{proposal.reason}</strong><pre>{proposal.patchJson}</pre><button className="button-primary" disabled={proposalBusy} onClick={() => void applyTutorProposal()}>{proposalBusy ? "Saving approved editâ€¦" : "Apply tutor edit"}</button><button className="button-soft" disabled={proposalBusy} onClick={() => setProposal(undefined)}>Dismiss proposal</button></section>}
    {shapeProposal && <section className="canvas-proposal" role="region" aria-label="QuickDraw AI proposal"><strong>AI canvas proposal</strong><p>{shapeProposal.description}</p><pre>{JSON.stringify(shapeProposal.actions, null, 2)}</pre><button className="button-primary" disabled={proposalBusy} onClick={() => {
      if (shapeProposal.requiresConfirmation && !window.confirm("This proposal includes deletion or a large batch. Apply it to this board?")) return;
      void applyQuickdrawProposal();
    }}>{proposalBusy ? "Saving approved proposalâ€¦" : "Apply canvas proposal"}</button><button className="button-soft" disabled={proposalBusy} onClick={() => setShapeProposal(undefined)}>Dismiss proposal</button></section>}
    {objectProposal && <section className="canvas-proposal" role="region" aria-label="Canvas object proposal"><strong>{objectProposal.reason}</strong><p>Add {objectProposal.object.kind} object</p><pre>{JSON.stringify(objectProposal.object, null, 2)}</pre><button className="button-primary" disabled={proposalBusy} onClick={() => void applyObjectProposal()}>{proposalBusy ? "Saving approved objectâ€¦" : "Add scientific object"}</button><button className="button-soft" disabled={proposalBusy} onClick={() => setObjectProposal(undefined)}>Dismiss proposal</button></section>}
    {artifactError && <section className="canvas-proposal" role="alert" aria-label="Board artifact problem" data-testid="board-artifact-problem">
      <strong>Board artifact needs correction</strong>
      <pre>{artifactError}</pre>
      <button className="button-soft" data-testid="dismiss-artifact-problem" onClick={() => setArtifactError(null)}>Dismiss</button>
    </section>}
    {artifactProposal && <section className="canvas-proposal" role="region" aria-label="Board artifact proposal" data-testid="board-artifact-proposal">
      <strong>Review board artifact</strong>
      <p>{artifactProposal.description}</p>
      {artifactProposal.brief.artifact.scenario && <p data-testid="artifact-scenario"><strong>Scenario:</strong> {artifactProposal.brief.artifact.scenario}</p>}
      {artifactProposal.brief.artifact.items?.filter((item) => item.scenario).map((item, index) => (
        <p key={`scenario-${index}`} data-testid="artifact-scenario"><strong>Scenario:</strong> {item.scenario}</p>
      ))}
      <p className="artifact-provenance" data-testid="generated-unverified">generated, not verified</p>
      {artifactProposal.sourceRefs.length > 0 && <p className="artifact-citations">
        citing {artifactProposal.sourceRefs.map((ref, index) => <span key={ref}><a href={`#studyai-citation=${encodeURIComponent(ref)}`}>{artifactProposal.brief.artifact.citationLabel ?? ref}</a>{index < artifactProposal.sourceRefs.length - 1 ? ", " : ""}</span>)}
      </p>}
      <button className="button-primary" disabled={proposalBusy} data-testid="apply-artifact" onClick={() => void applyArtifactProposal()}>{proposalBusy ? "Saving artifact…" : "Apply to board"}</button>
      <button className="button-soft" disabled={proposalBusy} data-testid="decline-artifact" onClick={() => setArtifactProposal(undefined)}>Decline</button>
    </section>}
    {exampleSession && <ExamplePlayer player={exampleSession.player} states={exampleSession.states} mode={exampleSession.mode} onEvent={handleExampleEvent} onTakeover={handleTakeover} />}
    {recognitionOpen && <section className="canvas-recognition" role="region" aria-label="Canvas recognition review">
      <header><strong>Canvas labels</strong><span>Teach selected ink, then confirm or correct labels</span><button className="icon-button" aria-label="Close canvas label review" onClick={() => setRecognitionOpen(false)}><X size={14} /></button></header>
      <div className="canvas-recognition-teach">
        <label>Label the selected ink<input aria-label="Recognition label" maxLength={80} value={teachLabel} placeholder="e.g. spring, Î¼, integral" onChange={(event) => setTeachLabel(event.target.value)} /></label>
        <button className="button-primary" disabled={!selectedShapeIds.length || !teachLabel.trim() || recognitionBusy} onClick={() => void teachSelection()}>{recognitionBusy ? "Savingâ€¦" : "Teach selected drawing"}</button>
        <small>{selectedShapeIds.length ? `${selectedShapeIds.length} stroke(s) selected` : "Select freehand strokes on the board first"}</small>
      </div>
      {recognitionGroups.length ? <ul className="canvas-recognition-list">{recognitionGroups.map(({ key, primary, count, confirmed }) => primary && <li key={key}>
        <div className="recognition-label"><b>{primary.text ?? "unlabeled"}</b>{confirmed ? <span className="recognition-confirmed">confirmed</span> : primary.confidence !== null ? <span>{Math.round(primary.confidence * 100)}%</span> : null}{count > 1 && !confirmed ? <span>+{count - 1} alternative</span> : null}</div>
        {confirmed ? null : <div className="recognition-actions">
          <button className="button-soft" disabled={recognitionBusy || !primary.text} onClick={() => void reviewCandidate(primary, "accept", primary.text ?? undefined)}>Accept</button>
          <button className="button-soft" disabled={recognitionBusy} onClick={() => void correctionPrompt(primary)}>Correctâ€¦</button>
          <button className="button-soft" disabled={recognitionBusy} onClick={() => void reviewCandidate(primary, "reject")}>Dismiss</button>
        </div>}
      </li>)}</ul> : <p className="canvas-recognition-empty">No recognition candidates on this revision. Teach a label to improve them.</p>}
      {Object.keys(exampleCounts).length ? <p className="canvas-recognition-counts">Taught labels: {Object.entries(exampleCounts).map(([label, total]) => `${label} (${total})`).join(", ")}</p> : null}
    </section>}
    <div className="canvas-tools-bar">
      <div className="canvas-board-selector">
        <button className="canvas-board-button" onClick={() => setBoardMenu((open) => !open)} aria-label={`Choose canvas board: ${activeBoard?.name ?? "Loading board"}`}><span>{activeBoard?.name ?? "Loading board"}</span><ChevronDown size={14} /></button>
        {boardMenu && <div className="canvas-board-menu">{boards.map((board) => <button key={board.id} className={board.id === activeBoard?.id ? "current" : ""} onClick={() => void changeBoard(board.id)}>{board.name}</button>)}<button onClick={() => void createBoard()}><Plus size={13} /> New board</button>{boards.length > 1 && <button className="delete-board" onClick={() => void deleteBoard()}><Trash2 size={13} /> Delete current board</button>}</div>}
      </div>
      {scienceMode && <span className="science-mode-status" role="status">{["vector", "force", "measurement", "relationship", "bond"].includes(scienceMode) ? "Drag to draw" : "Click to place"} {scienceMode} Â· Esc cancels</span>}
      {selectedId && <div className="science-selection-actions"><button className="button-soft" aria-label="Inspect selected object" onClick={() => setEditingId(selectedId)}>Inspect</button><button className="button-soft" aria-label="Send scientific object to back" onClick={() => { const object = document.objects.find((item) => item.id === selectedId)!; replaceObjects([object, ...document.objects.filter((item) => item.id !== selectedId)]); }}>Back</button><button className="button-soft" aria-label="Bring scientific object to front" onClick={() => { const object = document.objects.find((item) => item.id === selectedId)!; replaceObjects([...document.objects.filter((item) => item.id !== selectedId), object]); }}>Front</button><button className="button-soft" aria-label="Delete selected scientific object" onClick={() => { replaceObjects(document.objects.filter((item) => item.id !== selectedId)); setSelectedId(undefined); }}>Delete</button></div>}
      <div className="canvas-actions">
        <label className="canvas-egress" title="When on, cropped ink images may be sent to the configured cloud OCR providers. When off, ink images stay on this device and text-only analysis continues.">
          <input type="checkbox" checked={allowImageEgress} onChange={(event) => { const next = event.target.checked; setAllowImageEgress(next); try { localStorage.setItem("studyai.canvas.imageEgress", next ? "on" : "off"); } catch { /* storage unavailable */ } }} />Cloud ink OCR
        </label>
        <label className="canvas-palm" title="Once a stylus is seen, resting palms (touch pointers) stop drawing. Mouse input is never affected.">
          <input type="checkbox" aria-label="Palm rejection" checked={palmRejection} onChange={(event) => togglePalmRejection(event.target.checked)} />Palm rejection
        </label>
        {canvasAnalysis && analysisTelemetry && <output className="canvas-analysis-meta" title={analysisTelemetry.usage.length ? analysisTelemetry.usage.map((entry) => `${entry.provider}: ${entry.calls} call(s), ${entry.promptTokens + entry.completionTokens} tokens, $${entry.costUsd.toFixed(6)}`).join("\n") : "No cloud provider calls; deterministic and local stages only."}>
          {(analysisTelemetry.totalMs / 1000).toFixed(1)} s Â· {analysisTelemetry.usage.length ? `$${analysisTelemetry.usage.reduce((sum, entry) => sum + entry.costUsd, 0).toFixed(4)}` : "local only"}
        </output>}
        <button className="button-soft" aria-label="Analyze board" disabled={!activeBoard || loading || analysisBusy || proposalBusy} title="Select freehand strokes to target their complete ink groups; otherwise the highest-scoring, spatially diverse groups are analyzed." onClick={() => void analyzeBoard()}><Atom size={14} />{analysisBusy ? "Analyzingâ€¦" : "Analyze board"}</button>
        <button className="button-soft" aria-label="Review canvas labels" aria-pressed={recognitionOpen} disabled={!activeBoard || loading} title="Teach selected ink a label, then accept, correct, or dismiss recognition candidates." onClick={() => void openRecognition()}><Tag size={14} />Labels</button>
        <button className="icon-button" title="Undo" aria-label="Undo canvas change" disabled={!undoState.canUndo} onClick={undo}><Undo2 size={15} /></button>
        <button className="icon-button" title="Redo" aria-label="Redo canvas change" disabled={!undoState.canRedo} onClick={redo}><Redo2 size={15} /></button>
        <button className="icon-button" title="Import canvas JSON" aria-label="Import canvas JSON" onClick={() => importRef.current?.click()}><Upload size={15} /></button>
        <button className="icon-button" title="Export canvas JSON" aria-label="Export canvas JSON" onClick={exportJson}><Download size={15} /></button>
        <button className="icon-button" title="Export board image" aria-label="Export board image" onClick={() => void exportPng()}><FileText size={15} /></button>
        <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={(event) => void importJson(event.target.files?.[0])} />
      </div>
    </div>
    <div className="canvas-viewport lab-paper">
      {toolOpen && <aside className="canvas-tool-palette"><div className="palette-heading"><span>CANVAS TOOLS</span><button className="icon-button" title="Collapse canvas tools" aria-label="Collapse canvas tools" onClick={() => setToolOpen(false)}><X size={14} /></button></div><label className="palette-search"><Search size={14} /><input aria-label="Search canvas tools" placeholder="Find a tool" value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} /></label>{(["Draw", "Science", "Learning"] as const).map((group) => {
        const tools = filteredTools.filter((tool) => tool.group === group);
        return tools.length ? <section className="palette-group" key={group}><h2>{group}</h2>{tools.map((tool) => <button key={tool.id} className="palette-tool" title={tool.description} onClick={() => void useTool(tool)}><span className="palette-tool-icon" aria-hidden="true">{tool.group === "Draw" ? <span>{tool.label.slice(0, 1)}</span> : tool.id === "molecule" ? <Atom size={14} /> : tool.id.startsWith("linked-") ? <Link2 size={14} /> : tool.id === "concept" ? <BookOpen size={14} /> : <Plus size={14} />}</span><span>{tool.label}</span></button>)}</section> : null;
      })}</aside>}
      {!toolOpen && <button className="open-tool-palette" aria-label="Open canvas tools" title="Open canvas tools" onClick={() => setToolOpen(true)}><Plus size={16} /></button>}
      <div className={`canvas-board ${toolOpen ? "with-palette" : ""}`} ref={boardElement} tabIndex={0} data-selected-shape-ids={selectedShapeIds.join(",")} data-last-pen-gesture={lastPenGesture} onPointerDownCapture={(event) => {
        if (event.pointerType === "pen") {
          activePenPointer.current = event.pointerId;
          if (rearmPenModeOnNextPen.current && palmRejection) {
            rearmPenModeOnNextPen.current = false;
            editorRef.current?.setPenMode(true);
          }
        }
        // Explicit pointerType filtering complements Quickdraw's penMode gate:
        // a palm landing mid-stroke never even reaches the editor's listeners.
        if (palmRejection && event.pointerType === "touch" && activePenPointer.current !== null) { event.stopPropagation(); return; }
        if ((event.target as HTMLElement).closest(".quickdraw-native") && !(event.target as HTMLElement).closest("button,input,textarea,select") && event.button === 0) { nativeGesture.current = structuredClone(currentDocument()); setSelectedId(undefined); }
        const editor = editorRef.current;
        if (editor && (editor.tool === "draw" || editor.tool === "highlight") && event.button === 0) {
          const rect = editor.container.getBoundingClientRect();
          const page = editor.screenToPage(event.clientX - rect.left, event.clientY - rect.top);
          gestureTrail.current = [{ x: page.x, y: page.y, pointerType: event.pointerType, pressure: event.pressure }];
          gesturePointerId.current = event.pointerId;
          gestureStartedAt.current = Date.now();
        }
      }} onPointerMoveCapture={(event) => {
        if (palmRejection && event.pointerType === "touch" && activePenPointer.current !== null) event.stopPropagation();
        const editor = editorRef.current;
        if (!editor || gesturePointerId.current !== event.pointerId) return;
        const rect = editor.container.getBoundingClientRect();
        const page = editor.screenToPage(event.clientX - rect.left, event.clientY - rect.top);
        gestureTrail.current.push({ x: page.x, y: page.y, pointerType: event.pointerType, pressure: event.pressure });
      }} onPointerUpCapture={(event) => {
        if (activePenPointer.current === event.pointerId) activePenPointer.current = null;
        const trail = gestureTrail.current;
        const pointerId = gesturePointerId.current;
        gestureTrail.current = [];
        gesturePointerId.current = null;
        const editor = editorRef.current;
        if (editor && pointerId === event.pointerId) {
          if (trail.length >= 6) {
            const smoothed = smoothPenTrail(trail);
            const circle = isCircle(smoothed);
            const kind = circle ? "circle" : isScratchOut(smoothed) ? "scratch" : null;
            setLastPenGesture(kind ?? "none");
            // Quickdraw commits the stroke in its own pointerup handler, which runs
            // after this capture phase; a microtask lands after that commit but
            // before finishNativeGesture's timeout closes the history snapshot.
            if (kind) queueMicrotask(() => applyPenGesture(kind, smoothed, circle, editor));
          }
          const travelled = trail.reduce((sum, point, index) => index ? sum + Math.hypot(point.x - trail[index - 1].x, point.y - trail[index - 1].y) : 0, 0);
          const end = trail[trail.length - 1];
          if (end && trail.length <= 4 && travelled < 12 && Date.now() - gestureStartedAt.current < 400) {
            const now = Date.now();
            const previousTap = lastTap.current;
            // A tap is a probe, not a mark: remove the dot Quickdraw just drew
            // so declining the proposal leaves the saved document untouched.
            const dot = topInkId(editor);
            if (dot) editor.store.remove([dot]);
            if (previousTap && now - previousTap.time < 350 && Math.hypot(end.x - previousTap.x, end.y - previousTap.y) < 40) {
              lastTap.current = null;
              requestHandwritingLatex(end);
            } else {
              lastTap.current = { time: now, x: end.x, y: end.y };
            }
          }
        }
        finishNativeGesture();
      }} onPointerCancelCapture={(event) => {
        if (activePenPointer.current === event.pointerId) {
          activePenPointer.current = null;
          if (palmRejection) {
            rearmPenModeOnNextPen.current = true;
            editorRef.current?.setPenMode(false);
          }
        }
        nativeGesture.current = null;
        gestureTrail.current = [];
        gesturePointerId.current = null;
      }} onKeyDownCapture={(event) => {
        if ((event.target as HTMLElement).closest("input,textarea,select,math-field,[contenteditable='true']")) return;
        if (nativeGesture.current && TOOL_KEYS.has(event.key.toLowerCase())) cancelNativeGesture();
        if (event.code === "Space") setSpaceHeld(true);
        if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); if (event.shiftKey || event.key.toLowerCase() === "y") redo(); else undo(); }
        if (event.key === "Escape") { setScienceMode(null); setSelectedId(undefined); setEditingId(undefined); }
        if ((event.key === "Delete" || event.key === "Backspace") && selectedId) { event.preventDefault(); event.stopPropagation(); replaceObjects(documentRef.current.objects.filter((object) => object.id !== selectedId)); setSelectedId(undefined); }
      }} onKeyUpCapture={(event) => { if (event.code === "Space") setSpaceHeld(false); }} onBlur={() => setSpaceHeld(false)}>
        {loading ? <div className="canvas-loading">Loading saved canvasâ€¦</div> : <>
          <Quickdraw className="quickdraw-native" key={activeBoard?.id ?? "loading"} ref={quickdrawRef} theme={theme} grid="dots" snapshot={document.snapshot} onMount={onMount} onChange={handleQuickdrawChange} onSelectionChange={(ids) => setSelectedShapeIds(ids)} />
          {editorRef.current && <ScientificLayer objects={document.objects} editor={editorRef.current} mode={scienceMode} placementPatch={placementPatch} selectedId={selectedId} interactive={!spaceHeld && (nativeTool === "select" || Boolean(scienceMode))} registeredCards={registeredCards} dimmedIds={dimmedIds} highlightIds={highlightIds} onSelect={(id) => { setSelectedId(id); editorRef.current?.setSelection([]); }} onEdit={setEditingId} onCommit={replaceObjects} onFinish={() => setScienceMode(null)} onActivateMolecule={() => { cancelNativeGesture(); editorRef.current?.setTool("select"); setScienceMode("molecule"); }} onOpenNote={onOpenNote} onOpenDocument={onOpenDocument} />}
          <NarrationPanel objects={document.objects} boardRevision={activeBoard?.revision ?? 0} editor={editorRef.current} />
        </>}
        {proposalBusy && <div role="status" aria-live="polite" style={{ position: "absolute", inset: 0, zIndex: 20, cursor: "wait" }}>Saving approved canvas changeâ€¦</div>}
      </div>
    </div>
    {selectedObject && <ObjectEditor object={selectedObject} objects={document.objects} onChange={(next) => updateObject(selectedObject.id, next)} onClose={() => setEditingId(undefined)} onOpenNote={onOpenNote} onCreateLinkedGraph={() => createLinkedGraph(selectedObject.id)} onRegisterCard={async (front, back, conceptId) => {
      try {
        const response = await fetch(`${API}/study/cards`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, lessonId, conceptId, front, back }) });
        const value = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(value.error || "Card registration failed");
        setRegisteredCards((current) => current.includes(front) ? current : [...current, front]);
        onStatus("Added to review deck");
      } catch (error) { onStatus(error instanceof Error ? error.message : "Could not add card to review deck"); }
    }} />}
  </div>;
}

function CanvasAnalysisTutorContext({ analysis }: { analysis: CanvasAnalysisResult }) {
  useAgentContext({ description: "StudyAI canvas analysis result", value: analysis as never });
  return null;
}

function ObjectEditor({ object, objects, onChange, onClose, onOpenNote, onCreateLinkedGraph, onRegisterCard }: { object: ScientificObject; objects: ScientificObject[]; onChange: (object: Partial<ScientificObject>) => void; onClose: () => void; onOpenNote: (id: string) => void; onCreateLinkedGraph: () => void; onRegisterCard: (front: string, back: string, conceptId: string) => Promise<void> }) {
  const patch = (key: string, value: unknown) => onChange({ [key]: value } as Partial<ScientificObject>);
  const numberInput = (label: string, value: number, update: (value: number) => void, step = 1) => <label>{label}<input type="number" step={step} value={value} onChange={(event) => update(Number(event.target.value))} /></label>;
  const textInput = (label: string, value: string, update: (value: string) => void) => <label>{label}<input value={value} onChange={(event) => update(event.target.value)} /></label>;
  const referenceTitle = (ref: { scope: string; id: string }) => {
    const target = objects.find((item) => item.id === ref.id);
    return target ? objectTitle(target) : ref.id;
  };
  const conceptOptions = objects.flatMap((item) => item.kind === "concept" && item.conceptId ? [{ id: item.conceptId, label: item.title }] : []);
  const updateMindmap = (patchValue: Partial<Extract<ScientificObject, { kind: "mindmap" }>>) => onChange(patchValue as Partial<ScientificObject>);
  return <div className="canvas-editor-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="canvas-object-editor notebook-editor"><header><div><h3>{objectTitle(object)}</h3><GroundingBadges object={object} /></div><button className="icon-button" aria-label="Close object editor" onClick={onClose}><X size={17} /></button></header><div className="object-editor-fields">
    {object.kind === "molecule" && <MoleculeEditor molecule={object} onChange={(next) => onChange(next)} />}
    {object.kind === "atom" && <>{textInput("Label", object.label, (label) => patch("label", label))}<label>Element<select value={object.element} onChange={(event) => patch("element", event.target.value as Element)}>{elementOptions}</select></label>{numberInput("Nonbonding electrons", object.nonbondingElectrons, (value) => patch("nonbondingElectrons", value))}{numberInput("Bond order sum", object.bondOrderSum, (value) => patch("bondOrderSum", value), 0.5)}<div className="editor-calculation">Formal charge <b>{formatCharge(formalCharge(object.element, object.nonbondingElectrons, object.bondOrderSum))}</b></div></>}
    {object.kind === "bond" && <>{textInput("Label", object.label, (label) => patch("label", label))}{labelSelect("From atom", object.from, objects.filter((item) => item.kind === "atom" || item.id === object.from), (from) => patch("from", from))}{labelSelect("To atom", object.to, objects.filter((item) => item.kind === "atom" || item.id === object.to), (to) => patch("to", to))}<label>Bond order<select value={object.order} onChange={(event) => patch("order", Number(event.target.value) as BondOrder)}>{bondOrders.map((order) => <option key={order} value={order}>{order}</option>)}</select></label></>}
    {object.kind === "equation" && <>{!object.mathWorkspace && textInput("Equation", object.expression, (expression) => patch("expression", expression))}{textInput("Units", object.units ?? "", (units) => patch("units", units))}{object.mathWorkspace ? null : <EquationVariables object={object} onChange={onChange} />}<output className="expression-result">{object.evaluationError ?? (object.result === undefined ? "Evaluating…" : `Result: ${object.result}`)}</output><MathWorkspaceEditor object={object} onChange={onChange} onCreateLinkedGraph={onCreateLinkedGraph} /></>}
    {(object.kind === "vector" || object.kind === "force") && <ForceVectorEditor object={object} objects={objects} onChange={onChange} patch={patch} textInput={textInput} numberInput={numberInput} />}
    {object.kind === "measurement" && <>{textInput("Label", object.label, (label) => patch("label", label))}{numberInput("Value", object.value, (value) => { const g = lineGeometry(object), distance = Math.hypot(g.tip.x - g.tail.x, g.tip.y - g.tail.y); if (value > 0 && distance) onChange(withLineEndpoints({ ...object, geometry: { ...g, unitsPerCanvasUnit: value / distance } }, g.tail, g.tip)); }, 0.01)}{textInput("Units", object.units, (units) => patch("units", units))}<label>Units per canvas unit<input aria-label="Units per canvas unit" type="number" min="0" step="any" value={object.geometry?.unitsPerCanvasUnit ?? ""} placeholder="Uncalibrated" onChange={(event) => { const g = lineGeometry(object), scale = event.target.value === "" ? undefined : Number(event.target.value); if (scale === undefined || Number.isFinite(scale) && scale > 0) onChange(withLineEndpoints({ ...object, geometry: { ...g, unitsPerCanvasUnit: scale } }, g.tail, g.tip)); }} /></label><p>Distance follows the endpoints. Uncalibrated distances use canvas units.</p></>}
    {object.kind === "graph" && <>{textInput("Graph expression", object.expression, (expression) => patch("expression", expression))}<div className="vector-input-grid">{numberInput("x minimum", object.xRange[0], (value) => onChange({ xRange: [value, object.xRange[1]] } as Partial<ScientificObject>))}{numberInput("x maximum", object.xRange[1], (value) => onChange({ xRange: [object.xRange[0], value] } as Partial<ScientificObject>))}</div>{textInput("x-axis label", object.xLabel, (xLabel) => patch("xLabel", xLabel))}{textInput("y-axis label", object.yLabel, (yLabel) => patch("yLabel", yLabel))}<output className="expression-result">{object.evaluationError ?? `${object.points.length} sampled points`}</output><p>Hover over the plot to inspect coordinates. Drag its corner to resize.</p></>}
    {object.kind === "anatomy" && <>{textInput("Structure ID", object.structureId, (structureId) => patch("structureId", structureId))}{textInput("Body system", object.system, (system) => patch("system", system))}{textInput("Labels (comma-separated)", object.labels.join(", "), (labels) => patch("labels", labels.split(",").map((label) => label.trim()).filter(Boolean)))}</>}
    {object.kind === "concept" && <>{textInput("Title", object.title, (title) => patch("title", title))}<label>Definition<textarea value={object.definition} onChange={(event) => patch("definition", event.target.value)} /></label><label>Course concept<select value={object.conceptId ?? ""} onChange={(event) => patch("conceptId", event.target.value)}><option value="">Not linked</option>{conceptOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></>}
    {object.kind === "relationship" && <>{labelSelect("From", object.fromId, objects.filter((item) => item.id !== object.id), (fromId) => patch("geometry", { ...lineGeometry(object), tailRef: fromId ? { scope: "science", id: fromId } : undefined }))}{labelSelect("To", object.toId, objects.filter((item) => item.id !== object.id), (toId) => patch("geometry", { ...lineGeometry(object), tipRef: toId ? { scope: "science", id: toId } : undefined }))}{textInput("Relationship", object.label, (label) => patch("label", label))}</>}
    {object.kind === "linked-note" && <>{textInput("Note title", object.title, (title) => patch("title", title))}<label>Excerpt<textarea value={object.excerpt} onChange={(event) => patch("excerpt", event.target.value)} /></label><button className="button-soft" onClick={() => onOpenNote(object.noteId)}>Open source note</button></>}
    {object.kind === "linked-document" && <>{textInput("Document title", object.title, (title) => patch("title", title))}{textInput("Document ID", object.documentId, (documentId) => patch("documentId", documentId))}<label>Excerpt<textarea value={object.excerpt} onChange={(event) => patch("excerpt", event.target.value)} /></label></>}
    {object.kind === "question" && <>{textInput("Course concept ID", object.conceptId ?? "", (conceptId) => patch("conceptId", conceptId))}<label>Scenario<textarea value={object.scenario ?? ""} onChange={(event) => patch("scenario", event.target.value)} /></label><label>Question<textarea value={object.prompt} onChange={(event) => patch("prompt", event.target.value)} /></label><label>Answer<textarea value={object.answer ?? ""} onChange={(event) => patch("answer", event.target.value)} /></label></>}
    {object.kind === "flashcard" && <>{textInput("Course concept ID", object.conceptId ?? "", (conceptId) => patch("conceptId", conceptId))}<label>Front<textarea value={object.front} onChange={(event) => patch("front", event.target.value)} /></label><label>Back<textarea value={object.back} onChange={(event) => patch("back", event.target.value)} /></label>{object.conceptId?.trim() && <button className="button-soft" aria-label="Add to review deck" onClick={() => void onRegisterCard(object.front, object.back, object.conceptId ?? "")}>Add to review deck</button>}</>}
    {object.kind === "mindmap" && <><h4>Map</h4>{textInput("Title", object.title, (title) => updateMindmap({ title }))}<h4>Nodes</h4>{object.nodes.map((node, index) => <div className="mindmap-editor-row" key={node.id}>{textInput(`Node label ${index + 1}`, node.label, (label) => updateMindmap({ nodes: object.nodes.map((item) => item.id === node.id ? { ...item, label } : item) }))}</div>)}<h4>Edges</h4>{object.edges.map((edge, index) => <div className="mindmap-editor-row" key={`${edge.from}-${edge.to}-${index}`}>{textInput(`Edge label ${index + 1}`, edge.label ?? "", (label) => updateMindmap({ edges: object.edges.map((item, itemIndex) => itemIndex === index ? { ...item, label } : item) }))}</div>)}</>}
    {("geometry" in object && object.geometry) && <><h4>Attachments</h4><p>{object.geometry.tailRef ? `Start: ${referenceTitle(object.geometry.tailRef)}` : "Start: free"}<br />{object.geometry.tipRef ? `End: ${referenceTitle(object.geometry.tipRef)}` : "End: free"}</p><button className="button-soft" onClick={() => patch("geometry", { ...object.geometry!, tailRef: undefined, tipRef: undefined })}>Detach endpoints</button></>}
  </div><footer><button className="button-primary" onClick={onClose}>Done</button></footer></section></div>;
}

function EquationVariables({ object, onChange }: { object: Extract<ScientificObject, { kind: "equation" }>; onChange: (update: Partial<ScientificObject>) => void }) {
  const [names, setNames] = useState<string[]>(Object.keys(object.variables));
  useEffect(() => { let live = true; void compileExpression(object.expression).then((expression) => { if (live) setNames(expression.variables); }).catch(() => {}); return () => { live = false; }; }, [object.expression]);
  return <><h4>Variables</h4>{names.map((name) => <label key={name}>{name}<input aria-label={`Variable ${name}`} type="number" step="any" value={object.variables[name] ?? ""} onChange={(event) => { const value = Number(event.target.value); if (event.target.value !== "" && Number.isFinite(value)) onChange({ variables: { ...object.variables, [name]: value } }); }} /></label>)}</>;
}

type MathLiveField = HTMLElement & { value: string; getValue: (format?: string) => string };
function MathWorkspaceEditor({ object, onChange, onCreateLinkedGraph }: { object: Extract<ScientificObject, { kind: "equation" }>; onChange: (update: Partial<ScientificObject>) => void; onCreateLinkedGraph: () => void }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathLiveField | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void import("mathlive").then(() => {
      if (!live || !host.current) return;
      const element = globalThis.document.createElement("math-field") as MathLiveField;
      element.setAttribute("aria-label", "Math notation");
      element.style.display = "block";
      element.style.width = "100%";
      element.style.minHeight = "44px";
      element.style.padding = "8px";
      element.style.border = "1px solid #e4e7eb";
      element.style.borderRadius = "5px";
      element.value = object.mathWorkspace?.latex ?? object.expression;
      field.current = element;
      host.current.replaceChildren(element);
      setReady(true);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "MathLive could not load."));
    return () => { live = false; field.current = undefined; };
  }, [open]);
  const applyNotation = async () => {
    if (!field.current) return;
    setBusy(true); setError("");
    try {
      const state = await createMathWorkspaceState(field.current.value, field.current.getValue("ascii-math"), object.mathWorkspace, object.variables);
      onChange(state);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unsupported mathematical notation."); }
    finally { setBusy(false); }
  };
  const workspace = object.mathWorkspace;
  const updateParameter = (name: string, value: number) => {
    if (!workspace || !Number.isFinite(value)) return;
    const current = workspace.parameters[name];
    if (value < current.min || value > current.max) return;
    onChange({ variables: { ...object.variables, [name]: value }, mathWorkspace: { ...workspace, revision: workspace.revision + 1, parameters: { ...workspace.parameters, [name]: { ...current, value } } } });
  };
  const updateWorkspace = (patch: Partial<NonNullable<typeof workspace>>) => {
    if (workspace) onChange({ mathWorkspace: { ...workspace, ...patch, revision: workspace.revision + 1 } });
  };
  return <section className="math-workspace-editor" aria-label="Mathematical workspace">
    <h4>Mathematical workspace</h4>
    {!open ? <button className="button-soft" onClick={() => { setReady(false); setOpen(true); }}>Open MathLive editor</button> : <>
      <div ref={host} className="mathlive-field-host" />
      {!ready && <span role="status">Loading MathLiveâ€¦</span>}
      <button className="button-soft" disabled={!ready || busy} onClick={() => void applyNotation()}>{busy ? "Checking notationâ€¦" : "Apply notation"}</button>
    </>}
    {error && <output role="alert" className="expression-result">{error}</output>}
    {workspace && <>
      <output className="math-workspace-expression">Parsed expression: {object.expression}</output>
      {Object.entries(workspace.parameters).map(([name, parameter]) => <label key={name}>{name}<input aria-label={`Math parameter ${name}`} type="number" min={parameter.min} max={parameter.max} step={parameter.step} value={parameter.value} onChange={(event) => updateParameter(name, Number(event.target.value))} /><small>{parameter.min} to {parameter.max}</small></label>)}
      <label>Current statement, left<input aria-label="Statement left" value={workspace.statement.left} maxLength={500} onChange={(event) => updateWorkspace({ statement: { ...workspace.statement, left: event.target.value } })} /></label>
      <label>Current statement, right<input aria-label="Statement right" value={workspace.statement.right} maxLength={500} onChange={(event) => updateWorkspace({ statement: { ...workspace.statement, right: event.target.value } })} /></label>
      <label>Assumptions<textarea aria-label="Math assumptions" value={workspace.assumptions.join("\n")} maxLength={2400} onChange={(event) => updateWorkspace({ assumptions: event.target.value.split("\n").slice(0, 100).map((item) => item.slice(0, 240)) })} /></label>
      <label>Domain restrictions<textarea aria-label="Domain restrictions" value={workspace.domainRestrictions.join("\n")} maxLength={2400} onChange={(event) => updateWorkspace({ domainRestrictions: event.target.value.split("\n").slice(0, 100).map((item) => item.slice(0, 240)) })} /></label>
      <button className="button-soft" onClick={onCreateLinkedGraph}>Create linked graph</button>
      {workspace.verifiedSteps.map((step, index) => <output className="math-step-status" key={`${workspace.revision}-${index}`}>{step.status}: {step.before.left} = {step.before.right} â†’ {step.after.left} = {step.after.right}</output>)}
    </>}
  </section>;
}

function MoleculeEditor({ molecule, onChange }: { molecule: Extract<ScientificObject, { kind: "molecule" }>; onChange: (next: Partial<ScientificObject>) => void }) {
  const [chemistryStatus, setChemistryStatus] = useState("");
  const [checkingChemistry, setCheckingChemistry] = useState(false);
  const active = molecule.resonanceForms.find((form) => form.id === molecule.activeResonanceId) ?? molecule.resonanceForms[0];
  if (!active) return null;
  const updateAtom = (id: string, update: Partial<MoleculeAtom>) => onChange({ atoms: molecule.atoms.map((atom) => atom.id === id ? { ...atom, ...update } : atom) } as Partial<ScientificObject>);
  const updateBond = (id: string, update: Partial<MoleculeBond>) => onChange({ resonanceForms: molecule.resonanceForms.map((form) => form.id === active.id ? { ...form, bonds: form.bonds.map((bond) => bond.id === id ? { ...bond, ...update } : bond) } : form) } as Partial<ScientificObject>);
  const addAtom = () => { const atom = { id: newId("atom"), element: "H" as Element, nonbondingElectrons: 0 }; onChange({ atoms: [...molecule.atoms, atom] } as Partial<ScientificObject>); };
  const addBond = () => { if (molecule.atoms.length < 2) return; const bond = { id: newId("bond"), from: molecule.atoms[0].id, to: molecule.atoms[1].id, order: 1 as BondOrder }; onChange({ resonanceForms: molecule.resonanceForms.map((form) => form.id === active.id ? { ...form, bonds: [...form.bonds, bond] } : form) } as Partial<ScientificObject>); };
  const addResonance = () => { const form = { id: newId("form"), name: `Resonance form ${molecule.resonanceForms.length + 1}`, bonds: active.bonds.map((bond) => ({ ...bond })) }; onChange({ resonanceForms: [...molecule.resonanceForms, form], activeResonanceId: form.id } as Partial<ScientificObject>); };
  const valenceOrder = [1, 1.5, 2, 3] as const;
  return <>
    <label>Molecule name<input value={molecule.name} onChange={(event) => onChange({ name: event.target.value } as Partial<ScientificObject>)} /></label>
    <label>Resonance form<select value={active.id} onChange={(event) => onChange({ activeResonanceId: event.target.value } as Partial<ScientificObject>)}>{molecule.resonanceForms.map((form) => <option key={form.id} value={form.id}>{form.name}</option>)}</select></label>
    <h4>Atoms</h4>{molecule.atoms.map((atom) => <div className="molecule-row" key={atom.id}><select aria-label="Atom element" value={atom.element} onChange={(event) => updateAtom(atom.id, { element: event.target.value as Element })}>{elementOptions}</select><span>{atom.id.slice(0, 8)}</span><input aria-label="Nonbonding electrons" type="number" min="0" step="1" value={atom.nonbondingElectrons} onChange={(event) => updateAtom(atom.id, { nonbondingElectrons: Number(event.target.value) })} /><b>q {formatCharge(formalChargeForAtom(atom, bondOrderSum(molecule, atom.id)))}</b><button aria-label="Remove atom" onClick={() => { const ids = new Set(molecule.atoms.filter((item) => item.id !== atom.id).map((item) => item.id)); onChange({ atoms: molecule.atoms.filter((item) => item.id !== atom.id), resonanceForms: molecule.resonanceForms.map((form) => ({ ...form, bonds: form.bonds.filter((bond) => ids.has(bond.from) && ids.has(bond.to)) })) } as Partial<ScientificObject>); }}>Ã—</button></div>)}<button className="button-soft" onClick={addAtom}>Add atom</button>
    <h4>Bonds</h4>{active.bonds.map((bond) => <div className="molecule-row bond-row" key={bond.id}><select aria-label="Bond start atom" value={bond.from} onChange={(event) => updateBond(bond.id, { from: event.target.value })}>{molecule.atoms.map((atom) => <option key={atom.id} value={atom.id}>{atom.element} Â· {atom.id.slice(0, 4)}</option>)}</select><span>â†’</span><select aria-label="Bond end atom" value={bond.to} onChange={(event) => updateBond(bond.id, { to: event.target.value })}>{molecule.atoms.map((atom) => <option key={atom.id} value={atom.id}>{atom.element} Â· {atom.id.slice(0, 4)}</option>)}</select><select aria-label="Bond order" value={bond.order} onChange={(event) => updateBond(bond.id, { order: Number(event.target.value) as BondOrder })}>{valenceOrder.map((order) => <option key={order} value={order}>{order}</option>)}</select><button aria-label="Remove bond" onClick={() => onChange({ resonanceForms: molecule.resonanceForms.map((form) => form.id === active.id ? { ...form, bonds: form.bonds.filter((item) => item.id !== bond.id) } : form) } as Partial<ScientificObject>)}>Ã—</button></div>)}<button className="button-soft" onClick={addBond}>Add bond</button><button className="button-soft resonance-button" onClick={addResonance}>Duplicate as resonance form</button><button className="button-soft ocl-button" disabled={checkingChemistry} onClick={async () => { setCheckingChemistry(true); setChemistryStatus(""); try { const { validateWithOpenChemLib } = await import("./chemistry"); const result = validateWithOpenChemLib(molecule); setChemistryStatus(`OpenChemLib SMILES: ${result.smiles}`); } catch (error) { setChemistryStatus(error instanceof Error ? `OpenChemLib: ${error.message}` : "OpenChemLib could not convert this structure."); } finally { setCheckingChemistry(false); } }}>{checkingChemistry ? "Checking structureâ€¦" : "Convert with OpenChemLib"}</button>{chemistryStatus && <p className="chemistry-status">{chemistryStatus}</p>}
  </>;
}

function ForceVectorEditor({
  object,
  objects,
  onChange,
  patch,
  textInput,
  numberInput,
}: {
  object: Extract<ScientificObject, { kind: "vector" | "force" }>;
  objects: ScientificObject[];
  onChange: (update: Partial<ScientificObject>) => void;
  patch: (key: string, value: unknown) => void;
  textInput: (label: string, value: string, update: (value: string) => void) => React.ReactNode;
  numberInput: (label: string, value: number, update: (value: number) => void, step?: number) => React.ReactNode;
}) {
  const geometry = arrowGeometry(object);
  const currentAngle = Math.round(directionAngleDegrees(geometry.tail, geometry.tip));
  const mag = vectorMagnitude(...object.components);
  const fbdAnalysis = analyzePhysicsFreeBodyDiagram({ objects });
  const issueForObject = fbdAnalysis.issues.find((i) => i.targetId === object.id);
  const correction = fbdAnalysis.suggestedCorrections.find((c) => c.targetId === object.id);

  const updateAngle = (newAngleDeg: number) => {
    const rad = (newAngleDeg * Math.PI) / 180;
    const scale = geometry.unitsPerCanvasUnit ?? 1;
    const newComponents: [number, number, number] = [
      Math.round(mag * Math.cos(rad) * 100) / 100,
      Math.round(mag * Math.sin(rad) * 100) / 100,
      object.components[2],
    ];
    const newTip = {
      x: geometry.tail.x + newComponents[0] / scale,
      y: geometry.tail.y - newComponents[1] / scale,
    };
    onChange(withArrowEndpoints({ ...object, components: newComponents }, geometry.tail, newTip));
  };

  const updateMagnitude = (newMag: number) => {
    if (newMag <= 0) return;
    const rad = (currentAngle * Math.PI) / 180;
    const scale = geometry.unitsPerCanvasUnit ?? 1;
    const newComponents: [number, number, number] = [
      Math.round(newMag * Math.cos(rad) * 100) / 100,
      Math.round(newMag * Math.sin(rad) * 100) / 100,
      object.components[2],
    ];
    const newTip = {
      x: geometry.tail.x + newComponents[0] / scale,
      y: geometry.tail.y - newComponents[1] / scale,
    };
    onChange(withArrowEndpoints({ ...object, components: newComponents }, geometry.tail, newTip));
  };

  return (
    <>
      {textInput("Label", object.label, (label) => patch("label", label))}
      <div className="vector-input-grid">
        {object.components.map((value, index) =>
          numberInput(
            ["x", "y", "z"][index],
            value,
            (next) =>
              patch(
                "components",
                object.components.map((component, i) => (i === index ? next : component)) as [number, number, number]
              ),
            0.1
          )
        )}
      </div>
      <label>
        Direction angle: {currentAngle}°
        <input
          data-testid="force-angle-slider"
          aria-label="Force direction angle"
          type="range"
          min="-180"
          max="180"
          value={currentAngle}
          onChange={(e) => updateAngle(Number(e.target.value))}
        />
      </label>
      <label>
        Magnitude slider: {mag.toFixed(2)} {object.units}
        <input
          data-testid="force-magnitude-slider"
          aria-label="Force magnitude slider"
          type="range"
          min="1"
          max="500"
          value={Math.min(500, Math.max(1, Math.round(mag)))}
          onChange={(e) => updateMagnitude(Number(e.target.value))}
        />
      </label>
      {issueForObject && (
        <div
          data-testid="physics-diagnostic-alert"
          className="physics-alert"
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            padding: "8px 12px",
            borderRadius: "6px",
            margin: "8px 0",
            fontSize: "12px",
            color: "#92400e",
          }}
        >
          <p>⚠️ <strong>Physics diagnostic:</strong> {issueForObject.message}</p>
          {correction && (
            <button
              data-testid="apply-physics-correction"
              className="button-soft"
              style={{ marginTop: "6px" }}
              onClick={() => updateAngle(correction.correctedAngleDeg)}
            >
              Align to {correction.correctedAngleDeg}°
            </button>
          )}
        </div>
      )}
      {textInput("Units", object.units, (units) => patch("units", units))}
      <label>
        Units per canvas unit
        <input
          aria-label="Units per canvas unit"
          type="number"
          min="0.000001"
          step="any"
          placeholder="Uncalibrated"
          value={object.geometry?.unitsPerCanvasUnit ?? ""}
          onChange={(event) => {
            const scale = event.target.value === "" ? undefined : Number(event.target.value);
            if (scale !== undefined && (!Number.isFinite(scale) || scale <= 0)) return;
            onChange(withArrowEndpoints({ ...object, geometry: { ...geometry, unitsPerCanvasUnit: scale } }, geometry.tail, geometry.tip));
          }}
        />
      </label>
      <p>
        {object.geometry?.unitsPerCanvasUnit === undefined
          ? "Uncalibrated: x/y components use canvas units; upward is positive y."
          : "Scale supplied by you. The arrow shows x/y; z remains part of the magnitude."}
      </p>
      <div className="editor-calculation">
        Magnitude <b>{mag.toFixed(2)} {object.units}</b>
      </div>
    </>
  );
}

function labelSelect(label: string, value: string, objects: ScientificObject[], update: (value: string) => void) { return <label>{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">Choose object</option>{objects.map((object) => <option key={object.id} value={object.id}>{objectTitle(object)}</option>)}</select></label>; }
function formatCharge(charge: number) { return charge > 0 ? `+${charge}` : String(charge); }
function safeName(name: string) { return name.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "canvas"; }
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const link = Object.assign(window.document.createElement("a"), { href: url, download: filename }); link.click(); URL.revokeObjectURL(url); }
const elementOptions = (["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"] as Element[]).map((element) => <option key={element}>{element}</option>);
const bondOrders: BondOrder[] = [1, 1.5, 2, 3];
