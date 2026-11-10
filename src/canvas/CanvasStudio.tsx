import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Store } from "@quickdrawjs/core";
import { Quickdraw, type Editor, type QuickdrawRef } from "@quickdrawjs/react";
import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import type { CanvasAnalysisResult } from "../../server/canvas-analysis/contract.js";
import { API } from "../api";
import { ScientificLayer, type ScienceMode } from "./ScientificLayer";
import { arrowGeometry, synchronizeObject, withArrowEndpoints } from "./geometry";
import { lineGeometry, resolveScene, withLineEndpoints } from "./scene";
import { stableJson } from "./stable-json";
import { compileExpression, evaluateScientificObjects } from "./expressions";
import { objectTitle } from "./SceneGlyph";
import { applyCanvasProposal, canvasEditSchema, MathProposalValidationError, proposeCanvasEdit, type CanvasProposal } from "./tutor";
import { ArrowRight, Atom, BookOpen, ChartLine, ChevronDown, Download, FileQuestion, FileText, GalleryVerticalEnd, Hand, Link2, MousePointer2, MoveUpRight, Network, Pencil, Plus, Redo2, Ruler, ScanText, Search, Shapes, ShieldCheck, Sigma, Sparkles, StickyNote, Trash2, Type, Undo2, Upload, X } from "lucide-react";
import { formalCharge, vectorMagnitude, type Element } from "../science";
import { canvasTools, type CanvasTool } from "./registry";
import { bondOrderSum, createObject, emptyCanvasDocument, formalChargeForAtom, moleculeBonds, newId, parseCanvasDocument, type BondOrder, type CanvasDocument, type MoleculeAtom, type MoleculeBond, type ScientificObject } from "./model";
import { approveCanvasProposal, type CanvasProposal as ShapeProposal } from "./ai/canvas-actions";
import { useQuickdrawAIBridge } from "./ai/canvas-bridge";
import { createMathWorkspaceState, tutorMathWorkspace } from "./math-workspace";

type CourseNote = { id: string; title: string; body: string };
type CourseDocument = { id: string; title: string };
type Board = { id: string; name: string; revision: number };
type PersistedBoard = { id: string; course_id: string; lesson_id: string; revision: number; document: string };
type Props = { courseId: string; lessonId: string; theme: "light" | "dark"; onStatus: (status: string) => void; onOpenNote: (id: string) => void; onOpenDocument: (id: string, title: string) => void; onSummary: (summary: { objectCount: number; objectTypes: Record<string, number> }) => void; preferredBoardId?: string; onBoardState?: (state: { id: string; revision: number; saved: boolean }) => void; activityMode?: boolean; compactTools?: boolean };
const approveCanvasProposalAtRevision = approveCanvasProposal as unknown as (source: Store, activeBoardId: string, proposal: ShapeProposal, editor?: Editor, currentRevision?: number) => { changedId: string };

export function CanvasStudio({ courseId, lessonId, theme, onStatus, onOpenNote, onOpenDocument, onSummary, preferredBoardId, onBoardState, activityMode = false, compactTools = false }: Props) {
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
  const boardElement = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const toolPaletteRef = useRef<HTMLElement>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [document, setDocument] = useState<CanvasDocument>(emptyCanvasDocument());
  const [loading, setLoading] = useState(true);
  const [toolOpen, setToolOpen] = useState(true);
  const [toolSearch, setToolSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [, setEditorFrame] = useState(0);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  const [boardMenu, setBoardMenu] = useState(false);
  const [proposal, setProposal] = useState<CanvasProposal>();
  const [scienceMode, setScienceMode] = useState<ScienceMode>(null);
  const [placementPatch, setPlacementPatch] = useState<Partial<ScientificObject>>({});
  const [nativeTool, setNativeTool] = useState("select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [shapeProposal, setShapeProposal] = useState<ShapeProposal>();
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [canvasAnalysis, setCanvasAnalysis] = useState<CanvasAnalysisResult>();
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  useEffect(() => setToolOpen(!activityMode && !compactTools), [activityMode, compactTools]);
  useAgentContext({ description: "StudyAI active scientific canvas objects", value: { boardId: activeBoard?.id ?? "", courseId, lessonId, objects: loading ? [] : document.objects.map((object) => object.kind === "equation" && object.mathWorkspace ? { ...object, mathWorkspace: tutorMathWorkspace(object.mathWorkspace) } : object), freehand: "Uninterpreted Quickdraw snapshot" } });
  useFrontendTool({
    name: "propose_canvas_edit",
    description: "Propose an edit to an existing scientific object on the active board. The user must apply it before it changes the canvas. Use current IDs from canvas context.",
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

  const filteredTools = useMemo(() => {
    const query = toolSearch.trim().toLowerCase();
    return canvasTools.filter((tool) => !query || `${tool.label} ${tool.description} ${tool.group}`.toLowerCase().includes(query));
  }, [toolSearch]);
  useEffect(() => {
    if (toolOpen) toolPaletteRef.current?.scrollTo({ top: 0 });
  }, [toolOpen, toolSearch]);
  const selectedObject = document.objects.find((item) => item.id === editingId);

  useQuickdrawAIBridge({
    store: editorRef.current?.store ?? null,
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
        if (!Number.isInteger(result.revision) || result.revision! <= expectedRevision) throw new Error("Canvas save did not return a newer revision.");
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
    onStatus("Saving…");
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

  const analyzeBoard = useCallback(async () => {
    const board = boardRef.current;
    const editor = editorRef.current;
    if (!board || !editor || loading || analysisBusy || proposalBusy) return;
    const sequence = loadSequence.current;
    const requestDocument = structuredClone(currentDocument());
    const selectedIds = [...new Set([...selectedShapeIds, ...(selectedId ? [selectedId] : [])])];
    setCanvasAnalysis(undefined);
    setAnalysisBusy(true);
    try {
      if (!await saveNow()) throw new Error("Save the active board before analysis.");
      const persisted = await readAuthoritativeBoard(board);
      if (stableJson(persisted.document) !== stableJson(requestDocument)) throw new Error("The board changed while saving. Analyze again.");
      const image = await editor.exportImage({ background: true, scale: 2 });
      if (!image) throw new Error("The active board could not be rendered for analysis.");
      if (sequence !== loadSequence.current || boardRef.current?.id !== board.id || stableJson(currentDocument()) !== stableJson(requestDocument)) throw new Error("The board changed during analysis setup. Try again.");
      const response = await fetch(`${API}/canvases/${encodeURIComponent(board.id)}/analysis?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: persisted.revision, document: requestDocument, selectedIds, image: { base64: await blobToBase64(image), mimeType: image.type || "image/png" } }),
      });
      const body = await response.json() as { analysis?: CanvasAnalysisResult; error?: string };
      if (!response.ok || !body.analysis) throw new Error(body.error ?? "Canvas analysis failed.");
      if (body.analysis.boardId !== board.id || body.analysis.courseId !== courseId || body.analysis.lessonId !== lessonId || body.analysis.revision !== persisted.revision) throw new Error("Canvas analysis returned a mismatched or stale board revision.");
      if (sequence !== loadSequence.current || boardRef.current?.id !== board.id || stableJson(currentDocument()) !== stableJson(requestDocument)) throw new Error("The board changed while analysis was running. Analyze the current board again.");
      setCanvasAnalysis(body.analysis);
      onStatus("Canvas analysis is ready for the Tutor");
    } catch (error) {
      setCanvasAnalysis(undefined);
      onStatus(error instanceof Error ? error.message : "Canvas analysis failed");
    } finally { setAnalysisBusy(false); }
  }, [analysisBusy, courseId, currentDocument, lessonId, loading, onStatus, proposalBusy, readAuthoritativeBoard, saveNow, selectedId, selectedShapeIds]);

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
    editorListeners.current.push(unlistenHistory, unlistenCamera, unlistenTool, unlistenSelection);
    setEditorFrame((frame) => frame + 1);
    refreshHistory();
  }, [refreshHistory]);

  const handleQuickdrawChange = useCallback((_diff: unknown, source: string, editor: Editor) => {
    if (source !== "user") return;
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

  const replaceObjects = useCallback((objects: ScientificObject[], trackHistory = true) => {
    if (trackHistory) {
      objectHistory.current.undo.push(structuredClone(currentDocument()));
      objectHistory.current.redo = [];
    }
    latestChange.current = "objects";
    scheduleSave(boardRef.current, { ...currentDocument(), objects });
    refreshHistory();
  }, [currentDocument, refreshHistory, scheduleSave]);

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

  const activatePlacement = useCallback((kind: ScientificObject["kind"], patch: Partial<ScientificObject> = {}) => {
    editorRef.current?.setTool("select"); setScienceMode(kind); setPlacementPatch(patch); setToolOpen(false); setEditingId(undefined); setSelectedId(undefined);
  }, []);

  const useTool = useCallback(async (tool: CanvasTool) => {
    const sequence = loadSequence.current;
    if (tool.action === "quickdraw") {
      setScienceMode(null);
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
  }, [activatePlacement, courseId, lessonId, onStatus]);

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
    if (!activeBoard || boards.length < 2 || !window.confirm(`Delete “${activeBoard.name}”?`)) return;
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

  return <div className="canvas-studio">
    {canvasAnalysis && <CanvasAnalysisTutorContext analysis={canvasAnalysis} />}
    {proposal && <section className="canvas-proposal" role="region" aria-label="Tutor canvas proposal"><div className="canvas-proposal-icon"><Sparkles size={17} /></div><div className="canvas-proposal-content"><span className="canvas-proposal-kicker">TUTOR SUGGESTION</span><strong>{proposal.reason}</strong><div className="canvas-proposal-trust"><ShieldCheck size={13} /> Review required before this changes the saved board.</div><details><summary>Review technical changes</summary><pre>{proposal.patchJson}</pre></details><div className="canvas-proposal-actions"><button className="button-primary" disabled={proposalBusy} onClick={() => void applyTutorProposal()}>{proposalBusy ? "Saving approved edit…" : "Apply tutor edit"}</button><button className="button-soft" disabled={proposalBusy} onClick={() => setProposal(undefined)}>Dismiss</button></div></div></section>}
    {shapeProposal && <section className="canvas-proposal" role="region" aria-label="QuickDraw AI proposal"><div className="canvas-proposal-icon"><Sparkles size={17} /></div><div className="canvas-proposal-content"><span className="canvas-proposal-kicker">CANVAS SUGGESTION</span><strong>{shapeProposal.description}</strong><div className="canvas-proposal-trust"><ShieldCheck size={13} /> {shapeProposal.actions.length} proposed {shapeProposal.actions.length === 1 ? "action" : "actions"} · your approval is required.</div><details><summary>Review action details</summary><pre>{JSON.stringify(shapeProposal.actions, null, 2)}</pre></details><div className="canvas-proposal-actions"><button className="button-primary" disabled={proposalBusy} onClick={() => {
      if (shapeProposal.requiresConfirmation && !window.confirm("This proposal includes deletion or a large batch. Apply it to this board?")) return;
      void applyQuickdrawProposal();
    }}>{proposalBusy ? "Saving approved proposal…" : "Apply canvas proposal"}</button><button className="button-soft" disabled={proposalBusy} onClick={() => setShapeProposal(undefined)}>Dismiss</button></div></div></section>}
    <div className="canvas-tools-bar">
      <div className="canvas-board-selector">
        <button className="canvas-board-button" onClick={() => setBoardMenu((open) => !open)} aria-label="Choose canvas board"><span>{activeBoard?.name ?? "Loading board"}</span><ChevronDown size={14} /></button>
        {boardMenu && <div className="canvas-board-menu">{boards.map((board) => <button key={board.id} className={board.id === activeBoard?.id ? "current" : ""} onClick={() => void changeBoard(board.id)}>{board.name}</button>)}<button onClick={() => void createBoard()}><Plus size={13} /> New board</button>{boards.length > 1 && <button className="delete-board" onClick={() => void deleteBoard()}><Trash2 size={13} /> Delete current board</button>}</div>}
      </div>
      {scienceMode && <span className="science-mode-status" role="status">{["vector", "force", "measurement", "relationship", "bond"].includes(scienceMode) ? "Drag to draw" : "Click to place"} {scienceMode} · Esc cancels</span>}
      {selectedId && <div className="science-selection-actions"><button className="button-soft" aria-label="Inspect selected object" onClick={() => setEditingId(selectedId)}>Inspect</button><button className="button-soft" aria-label="Send scientific object to back" onClick={() => { const object = document.objects.find((item) => item.id === selectedId)!; replaceObjects([object, ...document.objects.filter((item) => item.id !== selectedId)]); }}>Back</button><button className="button-soft" aria-label="Bring scientific object to front" onClick={() => { const object = document.objects.find((item) => item.id === selectedId)!; replaceObjects([...document.objects.filter((item) => item.id !== selectedId), object]); }}>Front</button><button className="button-soft" aria-label="Delete selected scientific object" onClick={() => { replaceObjects(document.objects.filter((item) => item.id !== selectedId)); setSelectedId(undefined); }}>Delete</button></div>}
      <div className="canvas-actions">
        <button className="button-soft" disabled={!activeBoard || loading || analysisBusy || proposalBusy} title="Analyze the saved active board and share its validated evidence with the Tutor" onClick={() => void analyzeBoard()}><Atom size={14} />{analysisBusy ? "Analyzing…" : "Analyze board"}</button>
        <button className="icon-button" title="Undo" aria-label="Undo canvas change" disabled={!undoState.canUndo} onClick={undo}><Undo2 size={15} /></button>
        <button className="icon-button" title="Redo" aria-label="Redo canvas change" disabled={!undoState.canRedo} onClick={redo}><Redo2 size={15} /></button>
        <button className="icon-button" title="Import canvas JSON" aria-label="Import canvas JSON" onClick={() => importRef.current?.click()}><Upload size={15} /></button>
        <button className="icon-button" title="Export canvas JSON" aria-label="Export canvas JSON" onClick={exportJson}><Download size={15} /></button>
        <button className="icon-button" title="Export board image" aria-label="Export board image" onClick={() => void exportPng()}><FileText size={15} /></button>
        <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={(event) => void importJson(event.target.files?.[0])} />
      </div>
    </div>
    <div className="canvas-viewport">
      {toolOpen && <aside ref={toolPaletteRef} className="canvas-tool-palette"><div className="palette-heading"><span>CANVAS TOOLS</span><button className="icon-button" title="Collapse canvas tools" aria-label="Collapse canvas tools" onClick={() => setToolOpen(false)}><X size={14} /></button></div><label className="palette-search"><Search size={14} /><input aria-label="Search canvas tools" placeholder="Find a tool" value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} /></label>{(["Draw", "Science", "Learning"] as const).map((group) => {
        const tools = filteredTools.filter((tool) => tool.group === group);
        return tools.length ? <section className="palette-group" key={group}><h4>{group}</h4>{tools.map((tool) => <button key={tool.id} className="palette-tool" aria-label={tool.label} title={tool.description} onClick={() => void useTool(tool)}><span className="palette-tool-icon" aria-hidden="true"><CanvasToolIcon tool={tool} /></span><span className="palette-tool-copy"><b>{tool.label}</b><small>{tool.description}</small></span></button>)}</section> : null;
      })}</aside>}
      {!toolOpen && <button className="open-tool-palette" aria-label="Open canvas tools" title="Open canvas tools" onClick={() => setToolOpen(true)}><Plus size={16} /></button>}
      <div className={`canvas-board ${toolOpen ? "with-palette" : ""}`} ref={boardElement} tabIndex={0} onPointerDownCapture={(event) => {
        if ((event.target as HTMLElement).closest(".quickdraw-native") && !(event.target as HTMLElement).closest("button,input,textarea,select") && event.button === 0) { nativeGesture.current = structuredClone(currentDocument()); setSelectedId(undefined); }
      }} onPointerUpCapture={finishNativeGesture} onPointerCancelCapture={() => { nativeGesture.current = null; }} onKeyDownCapture={(event) => {
        if ((event.target as HTMLElement).closest("input,textarea,select,math-field,[contenteditable='true']")) return;
        if (event.code === "Space") setSpaceHeld(true);
        if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); event.shiftKey || event.key.toLowerCase() === "y" ? redo() : undo(); }
        if (event.key === "Escape") { setScienceMode(null); setSelectedId(undefined); setEditingId(undefined); }
        if ((event.key === "Delete" || event.key === "Backspace") && selectedId) { event.preventDefault(); event.stopPropagation(); replaceObjects(documentRef.current.objects.filter((object) => object.id !== selectedId)); setSelectedId(undefined); }
      }} onKeyUpCapture={(event) => { if (event.code === "Space") setSpaceHeld(false); }} onBlur={() => setSpaceHeld(false)}>
        {loading ? <div className="canvas-loading">Loading saved canvas…</div> : <>
          <Quickdraw className="quickdraw-native" key={activeBoard?.id ?? "loading"} ref={quickdrawRef} theme={theme} grid="dots" snapshot={document.snapshot} onMount={onMount} onChange={handleQuickdrawChange} onSelectionChange={(ids) => setSelectedShapeIds(ids)} />
          {editorRef.current && <ScientificLayer objects={document.objects} editor={editorRef.current} mode={scienceMode} placementPatch={placementPatch} selectedId={selectedId} interactive={!spaceHeld && (nativeTool === "select" || Boolean(scienceMode))} onSelect={(id) => { setSelectedId(id); editorRef.current?.setSelection([]); }} onEdit={setEditingId} onCommit={replaceObjects} onFinish={() => setScienceMode(null)} onActivateMolecule={() => { editorRef.current?.setTool("select"); setScienceMode("molecule"); }} onOpenNote={onOpenNote} onOpenDocument={onOpenDocument} />}
        </>}
        {proposalBusy && <div role="status" aria-live="polite" style={{ position: "absolute", inset: 0, zIndex: 20, cursor: "wait" }}>Saving approved canvas change…</div>}
      </div>
    </div>
    {selectedObject && <ObjectEditor object={selectedObject} objects={document.objects} onChange={(next) => updateObject(selectedObject.id, next)} onClose={() => setEditingId(undefined)} onOpenNote={onOpenNote} onCreateLinkedGraph={() => createLinkedGraph(selectedObject.id)} />}
  </div>;
}

function CanvasToolIcon({ tool }: { tool: CanvasTool }) {
  const icons: Record<string, React.ReactNode> = {
    select: <MousePointer2 size={15} />,
    hand: <Hand size={15} />,
    draw: <Pencil size={15} />,
    geo: <Shapes size={15} />,
    arrow: <ArrowRight size={15} />,
    text: <Type size={15} />,
    molecule: <Atom size={15} />,
    vector: <MoveUpRight size={15} />,
    force: <ArrowRight size={15} />,
    equation: <Sigma size={15} />,
    measurement: <Ruler size={15} />,
    graph: <ChartLine size={15} />,
    anatomy: <ScanText size={15} />,
    concept: <BookOpen size={15} />,
    relationship: <Network size={15} />,
    "linked-note": <StickyNote size={15} />,
    "linked-document": <Link2 size={15} />,
    question: <FileQuestion size={15} />,
    flashcard: <GalleryVerticalEnd size={15} />,
  };
  return icons[tool.id] ?? <Plus size={15} />;
}

function CanvasAnalysisTutorContext({ analysis }: { analysis: CanvasAnalysisResult }) {
  useAgentContext({ description: "StudyAI canvas analysis result", value: analysis as never });
  return null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function ObjectEditor({ object, objects, onChange, onClose, onOpenNote, onCreateLinkedGraph }: { object: ScientificObject; objects: ScientificObject[]; onChange: (object: Partial<ScientificObject>) => void; onClose: () => void; onOpenNote: (id: string) => void; onCreateLinkedGraph: () => void }) {
  const patch = (key: string, value: unknown) => onChange({ [key]: value } as Partial<ScientificObject>);
  const numberInput = (label: string, value: number, update: (value: number) => void, step = 1) => <label>{label}<input type="number" step={step} value={value} onChange={(event) => update(Number(event.target.value))} /></label>;
  const textInput = (label: string, value: string, update: (value: string) => void) => <label>{label}<input value={value} onChange={(event) => update(event.target.value)} /></label>;
  return <div className="canvas-editor-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="canvas-object-editor"><header><div><span>SCIENTIFIC OBJECT</span><h3>{objectTitle(object)}</h3></div><button className="icon-button" aria-label="Close object editor" onClick={onClose}><X size={17} /></button></header><div className="object-editor-fields">
    {object.kind === "molecule" && <MoleculeEditor molecule={object} onChange={(next) => onChange(next)} />}
    {object.kind === "atom" && <>{textInput("Label", object.label, (label) => patch("label", label))}<label>Element<select value={object.element} onChange={(event) => patch("element", event.target.value as Element)}>{elementOptions}</select></label>{numberInput("Nonbonding electrons", object.nonbondingElectrons, (value) => patch("nonbondingElectrons", value))}{numberInput("Bond order sum", object.bondOrderSum, (value) => patch("bondOrderSum", value), 0.5)}<div className="editor-calculation">Formal charge <b>{formatCharge(formalCharge(object.element, object.nonbondingElectrons, object.bondOrderSum))}</b></div></>}
    {object.kind === "bond" && <>{textInput("Label", object.label, (label) => patch("label", label))}{textInput("From atom ID", object.from, (from) => patch("from", from))}{textInput("To atom ID", object.to, (to) => patch("to", to))}<label>Bond order<select value={object.order} onChange={(event) => patch("order", Number(event.target.value) as BondOrder)}>{bondOrders.map((order) => <option key={order} value={order}>{order}</option>)}</select></label></>}
    {object.kind === "equation" && <>{!object.mathWorkspace && textInput("Equation", object.expression, (expression) => patch("expression", expression))}{textInput("Units", object.units ?? "", (units) => patch("units", units))}{object.mathWorkspace ? null : <EquationVariables object={object} onChange={onChange} />}<output className="expression-result">{object.evaluationError ?? (object.result === undefined ? "Evaluating…" : `Result: ${object.result}`)}</output><MathWorkspaceEditor object={object} onChange={onChange} onCreateLinkedGraph={onCreateLinkedGraph} /></>}
    {(object.kind === "vector" || object.kind === "force") && <>{textInput("Label", object.label, (label) => patch("label", label))}<div className="vector-input-grid">{object.components.map((value, index) => numberInput(["x", "y", "z"][index], value, (next) => patch("components", object.components.map((component, i) => i === index ? next : component) as [number, number, number]), 0.1))}</div>{textInput("Units", object.units, (units) => patch("units", units))}<label>Units per canvas unit<input aria-label="Units per canvas unit" type="number" min="0.000001" step="any" placeholder="Uncalibrated" value={object.geometry?.unitsPerCanvasUnit ?? ""} onChange={(event) => {
      const geometry = arrowGeometry(object); const scale = event.target.value === "" ? undefined : Number(event.target.value); if (scale !== undefined && (!Number.isFinite(scale) || scale <= 0)) return;
      onChange(withArrowEndpoints({ ...object, geometry: { ...geometry, unitsPerCanvasUnit: scale } }, geometry.tail, geometry.tip));
    }} /></label><p>{object.geometry?.unitsPerCanvasUnit === undefined ? "Uncalibrated: x/y components use canvas units; upward is positive y." : "Scale supplied by you. The arrow shows x/y; z remains part of the magnitude."}</p><div className="editor-calculation">Magnitude <b>{vectorMagnitude(...object.components).toFixed(3)} {object.geometry?.unitsPerCanvasUnit === undefined ? "canvas units" : object.units}</b></div></>}
    {object.kind === "measurement" && <>{textInput("Label", object.label, (label) => patch("label", label))}{numberInput("Value", object.value, (value) => { const g = lineGeometry(object), distance = Math.hypot(g.tip.x - g.tail.x, g.tip.y - g.tail.y); if (value > 0 && distance) onChange(withLineEndpoints({ ...object, geometry: { ...g, unitsPerCanvasUnit: value / distance } }, g.tail, g.tip)); }, 0.01)}{textInput("Units", object.units, (units) => patch("units", units))}<label>Units per canvas unit<input aria-label="Units per canvas unit" type="number" min="0" step="any" value={object.geometry?.unitsPerCanvasUnit ?? ""} placeholder="Uncalibrated" onChange={(event) => { const g = lineGeometry(object), scale = event.target.value === "" ? undefined : Number(event.target.value); if (scale === undefined || Number.isFinite(scale) && scale > 0) onChange(withLineEndpoints({ ...object, geometry: { ...g, unitsPerCanvasUnit: scale } }, g.tail, g.tip)); }} /></label><p>Distance follows the endpoints. Uncalibrated distances use canvas units.</p></>}
    {object.kind === "graph" && <>{textInput("Graph expression", object.expression, (expression) => patch("expression", expression))}<div className="vector-input-grid">{numberInput("x minimum", object.xRange[0], (value) => onChange({ xRange: [value, object.xRange[1]] } as Partial<ScientificObject>))}{numberInput("x maximum", object.xRange[1], (value) => onChange({ xRange: [object.xRange[0], value] } as Partial<ScientificObject>))}</div>{textInput("x-axis label", object.xLabel, (xLabel) => patch("xLabel", xLabel))}{textInput("y-axis label", object.yLabel, (yLabel) => patch("yLabel", yLabel))}<output className="expression-result">{object.evaluationError ?? `${object.points.length} sampled points`}</output><p>Hover over the plot to inspect coordinates. Drag its corner to resize.</p></>}
    {object.kind === "anatomy" && <>{textInput("Structure ID", object.structureId, (structureId) => patch("structureId", structureId))}{textInput("Body system", object.system, (system) => patch("system", system))}{textInput("Labels (comma-separated)", object.labels.join(", "), (labels) => patch("labels", labels.split(",").map((label) => label.trim()).filter(Boolean)))}</>}
    {object.kind === "concept" && <>{textInput("Title", object.title, (title) => patch("title", title))}<label>Definition<textarea value={object.definition} onChange={(event) => patch("definition", event.target.value)} /></label>{textInput("Course concept ID", object.conceptId ?? "", (conceptId) => patch("conceptId", conceptId))}</>}
    {object.kind === "relationship" && <>{labelSelect("From", object.fromId, objects.filter((item) => item.id !== object.id), (fromId) => patch("geometry", { ...lineGeometry(object), tailRef: fromId ? { scope: "science", id: fromId } : undefined }))}{labelSelect("To", object.toId, objects.filter((item) => item.id !== object.id), (toId) => patch("geometry", { ...lineGeometry(object), tipRef: toId ? { scope: "science", id: toId } : undefined }))}{textInput("Relationship", object.label, (label) => patch("label", label))}</>}
    {object.kind === "linked-note" && <>{textInput("Note title", object.title, (title) => patch("title", title))}<label>Excerpt<textarea value={object.excerpt} onChange={(event) => patch("excerpt", event.target.value)} /></label><button className="button-soft" onClick={() => onOpenNote(object.noteId)}>Open source note</button></>}
    {object.kind === "linked-document" && <>{textInput("Document title", object.title, (title) => patch("title", title))}{textInput("Document ID", object.documentId, (documentId) => patch("documentId", documentId))}<label>Excerpt<textarea value={object.excerpt} onChange={(event) => patch("excerpt", event.target.value)} /></label></>}
    {object.kind === "question" && <>{textInput("Course concept ID", object.conceptId ?? "", (conceptId) => patch("conceptId", conceptId))}<label>Question<textarea value={object.prompt} onChange={(event) => patch("prompt", event.target.value)} /></label><label>Answer<textarea value={object.answer ?? ""} onChange={(event) => patch("answer", event.target.value)} /></label></>}
    {object.kind === "flashcard" && <>{textInput("Course concept ID", object.conceptId ?? "", (conceptId) => patch("conceptId", conceptId))}<label>Front<textarea value={object.front} onChange={(event) => patch("front", event.target.value)} /></label><label>Back<textarea value={object.back} onChange={(event) => patch("back", event.target.value)} /></label></>}
    {("geometry" in object && object.geometry) && <><h4>Attachments</h4><p>{object.geometry.tailRef ? `Start: ${object.geometry.tailRef.scope} / ${object.geometry.tailRef.id}` : "Start: free"}<br />{object.geometry.tipRef ? `End: ${object.geometry.tipRef.scope} / ${object.geometry.tipRef.id}` : "End: free"}</p><button className="button-soft" onClick={() => patch("geometry", { ...object.geometry!, tailRef: undefined, tipRef: undefined })}>Detach endpoints</button></>}
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
      {!ready && <span role="status">Loading MathLive…</span>}
      <button className="button-soft" disabled={!ready || busy} onClick={() => void applyNotation()}>{busy ? "Checking notation…" : "Apply notation"}</button>
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
      {workspace.verifiedSteps.map((step, index) => <output className="math-step-status" key={`${workspace.revision}-${index}`}>{step.status}: {step.before.left} = {step.before.right} → {step.after.left} = {step.after.right}</output>)}
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
    <h4>Atoms</h4>{molecule.atoms.map((atom) => <div className="molecule-row" key={atom.id}><select aria-label="Atom element" value={atom.element} onChange={(event) => updateAtom(atom.id, { element: event.target.value as Element })}>{elementOptions}</select><span>{atom.id.slice(0, 8)}</span><input aria-label="Nonbonding electrons" type="number" min="0" step="1" value={atom.nonbondingElectrons} onChange={(event) => updateAtom(atom.id, { nonbondingElectrons: Number(event.target.value) })} /><b>q {formatCharge(formalChargeForAtom(atom, bondOrderSum(molecule, atom.id)))}</b><button aria-label="Remove atom" onClick={() => { const ids = new Set(molecule.atoms.filter((item) => item.id !== atom.id).map((item) => item.id)); onChange({ atoms: molecule.atoms.filter((item) => item.id !== atom.id), resonanceForms: molecule.resonanceForms.map((form) => ({ ...form, bonds: form.bonds.filter((bond) => ids.has(bond.from) && ids.has(bond.to)) })) } as Partial<ScientificObject>); }}>×</button></div>)}<button className="button-soft" onClick={addAtom}>Add atom</button>
    <h4>Bonds</h4>{active.bonds.map((bond) => <div className="molecule-row bond-row" key={bond.id}><select aria-label="Bond start atom" value={bond.from} onChange={(event) => updateBond(bond.id, { from: event.target.value })}>{molecule.atoms.map((atom) => <option key={atom.id} value={atom.id}>{atom.element} · {atom.id.slice(0, 4)}</option>)}</select><span>→</span><select aria-label="Bond end atom" value={bond.to} onChange={(event) => updateBond(bond.id, { to: event.target.value })}>{molecule.atoms.map((atom) => <option key={atom.id} value={atom.id}>{atom.element} · {atom.id.slice(0, 4)}</option>)}</select><select aria-label="Bond order" value={bond.order} onChange={(event) => updateBond(bond.id, { order: Number(event.target.value) as BondOrder })}>{valenceOrder.map((order) => <option key={order} value={order}>{order}</option>)}</select><button aria-label="Remove bond" onClick={() => onChange({ resonanceForms: molecule.resonanceForms.map((form) => form.id === active.id ? { ...form, bonds: form.bonds.filter((item) => item.id !== bond.id) } : form) } as Partial<ScientificObject>)}>×</button></div>)}<button className="button-soft" onClick={addBond}>Add bond</button><button className="button-soft resonance-button" onClick={addResonance}>Duplicate as resonance form</button><button className="button-soft ocl-button" disabled={checkingChemistry} onClick={async () => { setCheckingChemistry(true); setChemistryStatus(""); try { const { validateWithOpenChemLib } = await import("./chemistry"); const result = validateWithOpenChemLib(molecule); setChemistryStatus(`OpenChemLib SMILES: ${result.smiles}`); } catch (error) { setChemistryStatus(error instanceof Error ? `OpenChemLib: ${error.message}` : "OpenChemLib could not convert this structure."); } finally { setCheckingChemistry(false); } }}>{checkingChemistry ? "Checking structure…" : "Convert with OpenChemLib"}</button>{chemistryStatus && <p className="chemistry-status">{chemistryStatus}</p>}
  </>;
}

function labelSelect(label: string, value: string, objects: ScientificObject[], update: (value: string) => void) { return <label>{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">Choose object</option>{objects.map((object) => <option key={object.id} value={object.id}>{objectTitle(object)}</option>)}</select></label>; }
function formatCharge(charge: number) { return charge > 0 ? `+${charge}` : String(charge); }
function safeName(name: string) { return name.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "canvas"; }
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const link = Object.assign(window.document.createElement("a"), { href: url, download: filename }); link.click(); URL.revokeObjectURL(url); }
const elementOptions = (["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"] as Element[]).map((element) => <option key={element}>{element}</option>);
const bondOrders: BondOrder[] = [1, 1.5, 2, 3];
