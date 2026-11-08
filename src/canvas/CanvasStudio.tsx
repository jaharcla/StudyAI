import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Quickdraw, type Editor, type QuickdrawRef } from "@quickdrawjs/react";
import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import { API } from "../api";
import { ScientificLayer, type ScienceMode } from "./ScientificLayer";
import { arrowGeometry, synchronizeObject, withArrowEndpoints } from "./geometry";
import { applyCanvasProposal, canvasEditSchema, proposeCanvasEdit, type CanvasProposal } from "./tutor";
import { Atom, BookOpen, ChevronDown, Download, FileText, Link2, Plus, Redo2, Search, Trash2, Undo2, Upload, X } from "lucide-react";
import { formalCharge, vectorMagnitude, type Element } from "../science";
import { canvasTools, type CanvasTool } from "./registry";
import { bondOrderSum, createObject, emptyCanvasDocument, formalChargeForAtom, moleculeBonds, newId, parseCanvasDocument, sampleSquare, type BondOrder, type CanvasDocument, type MoleculeAtom, type MoleculeBond, type ScientificObject } from "./model";

type CourseNote = { id: string; title: string; body: string };
type CourseDocument = { id: string; title: string };
type Board = { id: string; name: string; revision: number };
type Props = { courseId: string; lessonId: string; theme: "light" | "dark"; onStatus: (status: string) => void; onOpenNote: (id: string) => void; onOpenDocument: (id: string, title: string) => void; onSummary: (summary: { objectCount: number; objectTypes: Record<string, number> }) => void };

export function CanvasStudio({ courseId, lessonId, theme, onStatus, onOpenNote, onOpenDocument, onSummary }: Props) {
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
  const dragRef = useRef<{ id: string; start: { x: number; y: number }; origin: { x: number; y: number }; previous: ScientificObject[] } | null>(null);
  const resizeRef = useRef<{ id: string; start: { x: number; y: number }; origin: { width: number; height: number }; previous: ScientificObject[]; scale: number } | null>(null);
  const boardElement = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
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
  const [nativeTool, setNativeTool] = useState("select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  useAgentContext({ description: "StudyAI active scientific canvas objects", value: { boardId: activeBoard?.id ?? "", courseId, lessonId, objects: loading ? [] : document.objects, freehand: "Uninterpreted Quickdraw snapshot" } });
  useFrontendTool({
    name: "propose_canvas_edit",
    description: "Propose an edit to an existing scientific object on the active board. The user must apply it before it changes the canvas. Use current IDs from canvas context.",
    parameters: canvasEditSchema,
    handler: async (edit) => {
      try {
        const next = proposeCanvasEdit({ boardId: boardRef.current?.id ?? "", courseId, lessonId, objects: documentRef.current.objects }, edit);
        setProposal(next);
        return { status: "pending_user_review", reason: next.reason };
      } catch (error) { return { status: "rejected", error: error instanceof Error ? error.message : "Invalid edit" }; }
    },
  }, [courseId, lessonId]);

  const filteredTools = useMemo(() => {
    const query = toolSearch.trim().toLowerCase();
    return canvasTools.filter((tool) => !query || `${tool.label} ${tool.description} ${tool.group}`.toLowerCase().includes(query));
  }, [toolSearch]);
  const selectedObject = document.objects.find((item) => item.id === editingId);

  const refreshHistory = useCallback(() => {
    const editor = editorRef.current;
    setUndoState({ canUndo: Boolean(objectHistory.current.undo.length), canRedo: Boolean(objectHistory.current.redo.length) });
  }, []);
  const cleanupEditor = useCallback(() => {
    editorListeners.current.forEach((unsubscribe) => unsubscribe());
    editorListeners.current = [];
    editorRef.current = null;
  }, []);

  const postDocument = useCallback(async (board: Board, next: CanvasDocument) => {
    try {
      const response = await fetch(`${API}/canvases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: board.id, courseId, lessonId, name: board.name, document: next }) });
      if (!response.ok) throw new Error("save failed");
      if (boardRef.current?.id === board.id) onStatus("All changes saved");
    } catch {
      if (boardRef.current?.id === board.id) onStatus("Canvas save unavailable");
    }
  }, [courseId, lessonId, onStatus]);

  const scheduleSave = useCallback((board: Board | null, next: CanvasDocument) => {
    documentRef.current = next;
    setDocument(next);
    if (!board) return;
    onStatus("Saving…");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void postDocument(board, next), 400);
  }, [onStatus, postDocument]);

  const currentDocument = useCallback(() => {
    const liveSnapshot = editorRef.current?.store.getSnapshot();
    return liveSnapshot ? { ...documentRef.current, snapshot: liveSnapshot } : documentRef.current;
  }, []);

  const saveNow = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const board = boardRef.current;
    if (board && !loading) await postDocument(board, currentDocument());
  }, [currentDocument, loading, postDocument]);

  const loadBoard = useCallback(async (board: Board) => {
    const sequence = ++loadSequence.current;
    window.clearTimeout(saveTimer.current);
    cleanupEditor();
    setLoading(true);
    setActiveBoard(board);
    boardRef.current = board;
    setSelectedId(undefined);
    setEditingId(undefined);
    setScienceMode(null);
    objectHistory.current = { undo: [], redo: [] };
    latestChange.current = "drawing";
    setUndoState({ canUndo: false, canRedo: false });
    try {
      const response = await fetch(`${API}/canvases/${encodeURIComponent(board.id)}?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`);
      if (!response.ok) throw new Error("load failed");
      const row = await response.json();
      const next = parseCanvasDocument(JSON.parse(row.document));
      if (sequence !== loadSequence.current) return;
      documentRef.current = next;
      setDocument(next);
    } catch {
      if (sequence !== loadSequence.current) return;
      const next = emptyCanvasDocument();
      documentRef.current = next;
      setDocument(next);
      onStatus("Canvas could not be loaded");
    } finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [cleanupEditor, onStatus, courseId, lessonId]);

  useEffect(() => {
    let live = true;
    ++loadSequence.current;
    setLoading(true);
    setProposal(undefined);
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
          setBoards(available);
          await loadBoard(available[0]);
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
        const save = await fetch(`${API}/canvases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...created, courseId, lessonId, document: initial }) });
        if (!save.ok) throw new Error("create failed");
        const body = await save.json();
        created.id = body.id;
        if (!live) return;
        setBoards([created]);
        boardRef.current = created;
        setActiveBoard(created);
        documentRef.current = initial;
        setDocument(initial);
        setLoading(false);
      } catch {
        if (!live) return;
        setBoards([]);
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
  }, [courseId, lessonId, cleanupEditor, currentDocument, loadBoard, onStatus, postDocument]);

  useEffect(() => {
    const counts = document.objects.reduce<Record<string, number>>((acc, object) => { acc[object.kind] = (acc[object.kind] ?? 0) + 1; return acc; }, {});
    onSummary({ objectCount: document.objects.length, objectTypes: counts });
  }, [document.objects, onSummary]);

  const onMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    const unlistenHistory = editor.store.listenHistory(refreshHistory);
    const unlistenCamera = editor.on("camera", () => setEditorFrame((frame) => frame + 1));
    const unlistenTool = editor.on("tool", () => { setNativeTool(editor.tool); setScienceMode(null); });
    const unlistenSelection = editor.on("selection", () => { if (editor.selection.size) setSelectedId(undefined); });
    editorListeners.current.push(unlistenHistory, unlistenCamera, unlistenTool, unlistenSelection);
    setEditorFrame((frame) => frame + 1);
    refreshHistory();
  }, [refreshHistory]);

  const handleQuickdrawChange = useCallback((_diff: unknown, source: string, editor: Editor) => {
    if (source !== "user") return;
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
    const before = nativeGesture.current; nativeGesture.current = null;
    if (!before) return;
    queueMicrotask(() => {
      if (JSON.stringify(before.snapshot) !== JSON.stringify(currentDocument().snapshot)) {
        objectHistory.current.undo.push(before); objectHistory.current.redo = []; refreshHistory();
      }
    });
  };

  const addObject = useCallback((kind: ScientificObject["kind"], patch?: Partial<ScientificObject>) => {
    const editor = editorRef.current;
    const rect = boardElement.current?.getBoundingClientRect();
    const point = editor && rect ? editor.screenToPage(rect.width / 2, rect.height / 2) : { x: 500, y: 360 };
    const object = { ...createObject(kind, point.x + (documentRef.current.objects.length % 4) * 36, point.y + (documentRef.current.objects.length % 4) * 32), ...patch } as ScientificObject;
    replaceObjects([...documentRef.current.objects, object]);
    setSelectedId(object.id);
    setEditingId(object.id);
  }, [replaceObjects]);

  const useTool = useCallback(async (tool: CanvasTool) => {
    if (tool.action === "quickdraw") {
      setScienceMode(null);
      quickdrawRef.current?.editor?.setTool(tool.tool);
      setToolOpen(false);
      return;
    }
    if (tool.id === "vector" || tool.id === "force") {
      editorRef.current?.setTool("select"); setScienceMode(tool.id); setToolOpen(false); setEditingId(undefined); return;
    }
    if (tool.id === "linked-note") {
      try {
        const rows = await fetch(`${API}/notes?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`).then((response) => { if (!response.ok) throw new Error("Notes unavailable"); return response.json(); }) as CourseNote[];
        let note = rows[0];
        if (!note) {
          const created = await fetch(`${API}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, lessonId, title: "Canvas note", body: "" }) }).then((response) => { if (!response.ok) throw new Error("Note creation failed"); return response.json(); });
          note = { id: created.id, title: "Canvas note", body: "" };
        }
        addObject("linked-note", { noteId: note.id, title: note.title, excerpt: note.body.slice(0, 180) } as Partial<ScientificObject>);
      } catch { onStatus("Course notes are unavailable"); }
      return;
    }
    if (tool.id === "linked-document") {
      try {
        const data = await fetch(`${API}/document-intelligence/documents?course=${encodeURIComponent(courseId)}`).then((response) => response.json()) as { documents: CourseDocument[] };
        const item = data.documents[0];
        if (!item) { onStatus("Import a course document before linking it"); return; }
        addObject("linked-document", { documentId: item.id, title: item.title } as Partial<ScientificObject>);
      } catch { onStatus("Course documents are unavailable"); }
      return;
    }
    addObject(tool.id);
  }, [addObject, courseId, lessonId, onStatus]);

  const createBoard = useCallback(async () => {
    const nextName = `Board ${boards.length + 1}`;
    const nextDocument = emptyCanvasDocument();
    const id = newId("canvas");
    try {
      await saveNow();
      const response = await fetch(`${API}/canvases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, courseId, lessonId, name: nextName, document: nextDocument }) });
      if (!response.ok) throw new Error("create failed");
      const board = { id, name: nextName, revision: 1 };
      setBoards((items) => [board, ...items]);
      await loadBoard(board); setBoardMenu(false);
    } catch { onStatus("Could not create a board"); }
  }, [boards.length, courseId, lessonId, loadBoard, onStatus, saveNow]);

  const changeBoard = useCallback(async (id: string) => {
    const board = boards.find((item) => item.id === id);
    if (!board || board.id === activeBoard?.id) return;
    await saveNow();
    await loadBoard(board);
    setBoardMenu(false);
  }, [activeBoard?.id, boards, loadBoard, saveNow]);

  const deleteBoard = useCallback(async () => {
    if (!activeBoard || boards.length < 2 || !window.confirm(`Delete “${activeBoard.name}”?`)) return;
    await fetch(`${API}/canvases/${encodeURIComponent(activeBoard.id)}?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`, { method: "DELETE" });
    const remaining = boards.filter((board) => board.id !== activeBoard.id);
    setBoards(remaining);
    await loadBoard(remaining[0]);
  }, [activeBoard, boards, loadBoard, courseId, lessonId]);

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
      const next = parseCanvasDocument(JSON.parse(await file.text()));
      if (!window.confirm("Replace this board with the imported canvas?")) return;
      editorRef.current?.store.loadSnapshot(next.snapshot);
      scheduleSave(boardRef.current, next);
      setSelectedId(undefined);
      onStatus("Canvas imported");
    } catch (error) { onStatus(error instanceof Error ? error.message : "Canvas import failed"); }
    finally { if (importRef.current) importRef.current.value = ""; }
  }, [onStatus, scheduleSave]);

  const startDrag = (event: React.PointerEvent, object: ScientificObject) => {
    if ((event.target as HTMLElement).closest("button,input,textarea,select,a")) return;
    const rect = boardElement.current?.getBoundingClientRect();
    if (!rect || !editorRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const page = editorRef.current.screenToPage(event.clientX - rect.left, event.clientY - rect.top);
    dragRef.current = { id: object.id, start: page, origin: { x: object.x, y: object.y }, previous: documentRef.current.objects };
    setSelectedId(object.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent) => {
    if (!dragRef.current || !editorRef.current) return;
    const rect = boardElement.current?.getBoundingClientRect();
    if (!rect) return;
    const point = editorRef.current.screenToPage(event.clientX - rect.left, event.clientY - rect.top);
    const drag = dragRef.current;
    const object = documentRef.current.objects.find((item) => item.id === drag.id);
    if (object) updateObject(drag.id, { x: drag.origin.x + point.x - drag.start.x, y: drag.origin.y + point.y - drag.start.y }, false);
  };
  const startResize = (event: React.PointerEvent, object: ScientificObject) => {
    event.preventDefault(); event.stopPropagation();
    resizeRef.current = { id: object.id, start: { x: event.clientX, y: event.clientY }, origin: { width: object.width, height: object.height }, previous: documentRef.current.objects, scale: Math.max(0.25, editorRef.current?.camera.z ?? 1) };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const moveResize = (event: React.PointerEvent) => {
    const resize = resizeRef.current;
    if (!resize) return;
    updateObject(resize.id, { width: Math.max(150, resize.origin.width + (event.clientX - resize.start.x) / resize.scale), height: Math.max(78, resize.origin.height + (event.clientY - resize.start.y) / resize.scale) }, false);
  };
  const finishDrag = () => {
    if (dragRef.current) { objectHistory.current.undo.push({ ...currentDocument(), objects: dragRef.current.previous }); objectHistory.current.redo = []; latestChange.current = "objects"; refreshHistory(); }
    if (resizeRef.current) { objectHistory.current.undo.push({ ...currentDocument(), objects: resizeRef.current.previous }); objectHistory.current.redo = []; latestChange.current = "objects"; refreshHistory(); }
    dragRef.current = null; resizeRef.current = null;
  };

  return <div className="canvas-studio">
    {proposal && <section className="canvas-proposal" role="region" aria-label="Tutor canvas proposal"><strong>{proposal.reason}</strong><pre>{proposal.patchJson}</pre><button className="button-primary" onClick={() => {
      try { replaceObjects(applyCanvasProposal({ boardId: boardRef.current?.id ?? "", courseId, lessonId, objects: documentRef.current.objects }, proposal)); setProposal(undefined); }
      catch (error) { onStatus(error instanceof Error ? error.message : "Could not apply proposal"); setProposal(undefined); }
    }}>Apply tutor edit</button><button className="button-soft" onClick={() => setProposal(undefined)}>Dismiss proposal</button></section>}
    <div className="canvas-tools-bar">
      <div className="canvas-board-selector">
        <button className="canvas-board-button" onClick={() => setBoardMenu((open) => !open)} aria-label="Choose canvas board"><span>{activeBoard?.name ?? "Loading board"}</span><ChevronDown size={14} /></button>
        {boardMenu && <div className="canvas-board-menu">{boards.map((board) => <button key={board.id} className={board.id === activeBoard?.id ? "current" : ""} onClick={() => void changeBoard(board.id)}>{board.name}</button>)}<button onClick={() => void createBoard()}><Plus size={13} /> New board</button>{boards.length > 1 && <button className="delete-board" onClick={() => void deleteBoard()}><Trash2 size={13} /> Delete current board</button>}</div>}
      </div>
      {scienceMode && <span className="science-mode-status" role="status">Drag to draw {scienceMode} · Esc cancels</span>}
      {selectedId && <button className="button-soft" aria-label="Inspect selected object" onClick={() => setEditingId(selectedId)}>Inspect</button>}
      <div className="canvas-actions">
        <button className="icon-button" title="Undo" aria-label="Undo canvas change" disabled={!undoState.canUndo} onClick={undo}><Undo2 size={15} /></button>
        <button className="icon-button" title="Redo" aria-label="Redo canvas change" disabled={!undoState.canRedo} onClick={redo}><Redo2 size={15} /></button>
        <button className="icon-button" title="Import canvas JSON" aria-label="Import canvas JSON" onClick={() => importRef.current?.click()}><Upload size={15} /></button>
        <button className="icon-button" title="Export canvas JSON" aria-label="Export canvas JSON" onClick={exportJson}><Download size={15} /></button>
        <button className="icon-button" title="Export board image" aria-label="Export board image" onClick={() => void exportPng()}><FileText size={15} /></button>
        <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={(event) => void importJson(event.target.files?.[0])} />
      </div>
    </div>
    <div className="canvas-viewport">
      {toolOpen && <aside className="canvas-tool-palette"><div className="palette-heading"><span>CANVAS TOOLS</span><button className="icon-button" title="Collapse canvas tools" aria-label="Collapse canvas tools" onClick={() => setToolOpen(false)}><X size={14} /></button></div><label className="palette-search"><Search size={14} /><input aria-label="Search canvas tools" placeholder="Find a tool" value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} /></label>{(["Draw", "Science", "Learning"] as const).map((group) => {
        const tools = filteredTools.filter((tool) => tool.group === group);
        return tools.length ? <section className="palette-group" key={group}><h4>{group}</h4>{tools.map((tool) => <button key={tool.id} className="palette-tool" title={tool.description} onClick={() => void useTool(tool)}><span className="palette-tool-icon" aria-hidden="true">{tool.group === "Draw" ? <span>{tool.label.slice(0, 1)}</span> : tool.id === "molecule" ? <Atom size={14} /> : tool.id.startsWith("linked-") ? <Link2 size={14} /> : tool.id === "concept" ? <BookOpen size={14} /> : <Plus size={14} />}</span><span>{tool.label}</span></button>)}</section> : null;
      })}</aside>}
      {!toolOpen && <button className="open-tool-palette" aria-label="Open canvas tools" title="Open canvas tools" onClick={() => setToolOpen(true)}><Plus size={16} /></button>}
      <div className={`canvas-board ${toolOpen ? "with-palette" : ""}`} ref={boardElement} tabIndex={0} onPointerDownCapture={(event) => {
        if ((event.target as HTMLElement).tagName === "CANVAS" && event.button === 0) { nativeGesture.current = structuredClone(currentDocument()); setSelectedId(undefined); }
      }} onPointerUpCapture={finishNativeGesture} onPointerCancelCapture={() => { nativeGesture.current = null; }} onKeyDownCapture={(event) => {
        if ((event.target as HTMLElement).closest("input,textarea,select")) return;
        if (event.code === "Space") setSpaceHeld(true);
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.stopPropagation(); event.shiftKey ? redo() : undo(); }
        if (event.key === "Escape") { setScienceMode(null); setSelectedId(undefined); setEditingId(undefined); }
        if ((event.key === "Delete" || event.key === "Backspace") && selectedId) { event.preventDefault(); event.stopPropagation(); replaceObjects(documentRef.current.objects.filter((object) => object.id !== selectedId)); setSelectedId(undefined); }
      }} onKeyUpCapture={(event) => { if (event.code === "Space") setSpaceHeld(false); }} onBlur={() => setSpaceHeld(false)}>
        {loading ? <div className="canvas-loading">Loading saved canvas…</div> : <>
          <Quickdraw key={activeBoard?.id ?? "loading"} ref={quickdrawRef} theme={theme} grid="dots" snapshot={document.snapshot} onMount={onMount} onChange={handleQuickdrawChange} />
          {editorRef.current && <ScientificLayer objects={document.objects} editor={editorRef.current} mode={scienceMode} selectedId={selectedId} interactive={!spaceHeld && (nativeTool === "select" || Boolean(scienceMode))} onSelect={(id) => { setSelectedId(id); editorRef.current?.setSelection([]); }} onEdit={setEditingId} onCommit={replaceObjects} onFinish={() => setScienceMode(null)} />}
          <div className="canvas-object-layer">
            {document.objects.filter((object) => object.kind !== "vector" && object.kind !== "force").map((object) => <CanvasCard key={object.id} object={object} editor={editorRef.current} selected={selectedId === object.id} onSelect={() => setSelectedId(object.id)} onEdit={() => setEditingId(object.id)} onDelete={() => { replaceObjects(documentRef.current.objects.filter((item) => item.id !== object.id)); if (selectedId === object.id) setSelectedId(undefined); }} onPointerDown={(event) => startDrag(event, object)} onPointerMove={moveDrag} onPointerUp={finishDrag} onResizeStart={(event) => startResize(event, object)} onResizeMove={moveResize} onOpenNote={onOpenNote} onOpenDocument={onOpenDocument} />)}
          </div>
        </>}
      </div>
    </div>
    {selectedObject && <ObjectEditor object={selectedObject} objects={document.objects} onChange={(next) => updateObject(selectedObject.id, next)} onClose={() => setEditingId(undefined)} onOpenNote={onOpenNote} />}
  </div>;
}

function CanvasCard({ object, editor, selected, onSelect, onEdit, onDelete, onPointerDown, onPointerMove, onPointerUp, onResizeStart, onResizeMove, onOpenNote, onOpenDocument }: { object: ScientificObject; editor: Editor | null; selected: boolean; onSelect: () => void; onEdit: () => void; onDelete: () => void; onPointerDown: (event: React.PointerEvent, object: ScientificObject) => void; onPointerMove: (event: React.PointerEvent) => void; onPointerUp: () => void; onResizeStart: (event: React.PointerEvent) => void; onResizeMove: (event: React.PointerEvent) => void; onOpenNote: (id: string) => void; onOpenDocument: (id: string, title: string) => void }) {
  const screen = editor ? editor.pageToScreen(object.x, object.y) : { x: object.x, y: object.y };
  const scale = editor?.camera.z ?? 1;
  return <article className={`canvas-object ${selected ? "selected" : ""}`} style={{ left: screen.x, top: screen.y, width: object.width, height: object.height, transform: `translate(-50%, -50%) scale(${scale})` }} onPointerDown={(event) => onPointerDown(event, object)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClick={onSelect}>
    <div className="canvas-object-header"><strong>{object.kind === "molecule" ? object.name : objectTitle(object)}</strong><span className="canvas-object-controls"><button title="Edit object" aria-label={`Edit ${objectTitle(object)}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onEdit(); }}>Edit</button><button title="Delete object" aria-label={`Delete ${objectTitle(object)}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onDelete(); }}><X size={12} /></button></span></div>
    <CardContent object={object} onOpenNote={onOpenNote} onOpenDocument={onOpenDocument} /><button className="canvas-object-resize" aria-label="Resize canvas object" onPointerDown={(event) => onResizeStart(event)} onPointerMove={onResizeMove} onPointerUp={onPointerUp} />
  </article>;
}

function CardContent({ object, onOpenNote, onOpenDocument }: { object: ScientificObject; onOpenNote: (id: string) => void; onOpenDocument: (id: string, title: string) => void }) {
  if (object.kind === "molecule") {
    const bonds = moleculeBonds(object);
    return <div className="object-molecule"><MoleculeGlyph molecule={object} bonds={bonds} /><small>{object.atoms.length} atoms · {bonds.length} bonds · {object.resonanceForms.length} form{object.resonanceForms.length === 1 ? "" : "s"}</small></div>;
  }
  if (object.kind === "vector" || object.kind === "force") {
    const magnitude = vectorMagnitude(...object.components);
    return <div className="object-vector"><VectorGlyph components={object.components} /><span>{object.components.map((value) => Number(value.toFixed(2))).join(", ")}{object.units ? ` ${object.units}` : ""}</span><b>|v| = {magnitude.toFixed(3)} {object.units}</b></div>;
  }
  if (object.kind === "equation") return <div className="object-text"><b>{object.expression || "Equation"}</b><small>{Object.entries(object.variables).map(([key, value]) => `${key} = ${value}`).join(" · ")}</small></div>;
  if (object.kind === "graph") return <div className="object-graph"><GraphGlyph points={object.points} /><small>{object.points.length} data points · {object.xLabel} vs {object.yLabel}</small></div>;
  if (object.kind === "measurement") return <div className="object-text"><b>{object.value} {object.units}</b><small>{object.label}</small></div>;
  if (object.kind === "atom") { const charge = formalCharge(object.element, object.nonbondingElectrons, object.bondOrderSum); return <div className="object-atom"><b>{object.element}<sup>{charge === 0 ? "" : charge > 0 ? `+${charge}` : charge}</sup></b><small>{object.label} · formal charge {charge > 0 ? `+${charge}` : charge}</small></div>; }
  if (object.kind === "bond") return <div className="object-text"><b>{object.label} · order {object.order}</b><small>{object.from} → {object.to}</small></div>;
  if (object.kind === "concept") return <div className="object-text"><b>{object.title}</b><small>{object.definition || "No definition"}</small></div>;
  if (object.kind === "relationship") return <div className="object-text"><b>{object.label}</b><small>{object.fromId || "Unlinked"} → {object.toId || "Unlinked"}</small></div>;
  if (object.kind === "linked-note") return <div className="object-text"><b>{object.title}</b><small>{object.excerpt || "Linked course note"}</small><button className="object-link" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenNote(object.noteId); }}>Open note</button></div>;
  if (object.kind === "linked-document") return <div className="object-text"><b>{object.title}</b><small>{object.excerpt || "Linked course document"}</small><button className="object-link" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenDocument(object.documentId, object.title); }}>Open source</button></div>;
  if (object.kind === "anatomy") return <div className="object-text"><b>{object.structureId || "Structure identifier"}</b><small>{[object.system, ...object.labels].filter(Boolean).join(" · ") || "Biological structure"}</small></div>;
  if (object.kind === "question") return <div className="object-text"><b>{object.prompt}</b><small>{object.answer ? `Answer: ${object.answer}` : "Practice question"}</small></div>;
  return <div className="object-text"><b>{object.front}</b><small>{object.back}</small></div>;
}

function ObjectEditor({ object, objects, onChange, onClose, onOpenNote }: { object: ScientificObject; objects: ScientificObject[]; onChange: (object: Partial<ScientificObject>) => void; onClose: () => void; onOpenNote: (id: string) => void }) {
  const patch = (key: string, value: unknown) => onChange({ [key]: value } as Partial<ScientificObject>);
  const numberInput = (label: string, value: number, update: (value: number) => void, step = 1) => <label>{label}<input type="number" step={step} value={value} onChange={(event) => update(Number(event.target.value))} /></label>;
  const textInput = (label: string, value: string, update: (value: string) => void) => <label>{label}<input value={value} onChange={(event) => update(event.target.value)} /></label>;
  return <div className="canvas-editor-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="canvas-object-editor"><header><div><span>SCIENTIFIC OBJECT</span><h3>{objectTitle(object)}</h3></div><button className="icon-button" aria-label="Close object editor" onClick={onClose}><X size={17} /></button></header><div className="object-editor-fields">
    {object.kind === "molecule" && <MoleculeEditor molecule={object} onChange={(next) => onChange(next)} />}
    {object.kind === "atom" && <>{textInput("Label", object.label, (label) => patch("label", label))}<label>Element<select value={object.element} onChange={(event) => patch("element", event.target.value as Element)}>{elementOptions}</select></label>{numberInput("Nonbonding electrons", object.nonbondingElectrons, (value) => patch("nonbondingElectrons", value))}{numberInput("Bond order sum", object.bondOrderSum, (value) => patch("bondOrderSum", value), 0.5)}<div className="editor-calculation">Formal charge <b>{formatCharge(formalCharge(object.element, object.nonbondingElectrons, object.bondOrderSum))}</b></div></>}
    {object.kind === "bond" && <>{textInput("Label", object.label, (label) => patch("label", label))}{textInput("From atom ID", object.from, (from) => patch("from", from))}{textInput("To atom ID", object.to, (to) => patch("to", to))}<label>Bond order<select value={object.order} onChange={(event) => patch("order", Number(event.target.value) as BondOrder)}>{bondOrders.map((order) => <option key={order} value={order}>{order}</option>)}</select></label></>}
    {object.kind === "equation" && <>{textInput("Equation", object.expression, (expression) => patch("expression", expression))}{textInput("Units", object.units ?? "", (units) => patch("units", units))}<h4>Variables</h4>{Object.entries(object.variables).map(([name, value]) => numberInput(name, value, (next) => patch("variables", { ...object.variables, [name]: next })))}<button className="button-soft" onClick={() => patch("variables", { ...object.variables, [`x${Object.keys(object.variables).length + 1}`]: 0 })}>Add variable</button></>}
    {(object.kind === "vector" || object.kind === "force") && <>{textInput("Label", object.label, (label) => patch("label", label))}<div className="vector-input-grid">{object.components.map((value, index) => numberInput(["x", "y", "z"][index], value, (next) => patch("components", object.components.map((component, i) => i === index ? next : component) as [number, number, number]), 0.1))}</div>{textInput("Units", object.units, (units) => patch("units", units))}<label>Units per canvas unit<input aria-label="Units per canvas unit" type="number" min="0.000001" step="any" placeholder="Uncalibrated" value={object.geometry?.unitsPerCanvasUnit ?? ""} onChange={(event) => {
      const geometry = arrowGeometry(object); const scale = event.target.value === "" ? undefined : Number(event.target.value); if (scale !== undefined && (!Number.isFinite(scale) || scale <= 0)) return;
      onChange(withArrowEndpoints({ ...object, geometry: { ...geometry, unitsPerCanvasUnit: scale } }, geometry.tail, geometry.tip));
    }} /></label><p>{object.geometry?.unitsPerCanvasUnit === undefined ? "Uncalibrated: x/y components use canvas units; upward is positive y." : "Scale supplied by you. The arrow shows x/y; z remains part of the magnitude."}</p><div className="editor-calculation">Magnitude <b>{vectorMagnitude(...object.components).toFixed(3)} {object.units}</b></div></>}
    {object.kind === "measurement" && <>{textInput("Label", object.label, (label) => patch("label", label))}{numberInput("Value", object.value, (value) => patch("value", value), 0.01)}{textInput("Units", object.units, (units) => patch("units", units))}</>}
    {object.kind === "graph" && <><label>Graph model<input value={object.expression} readOnly /></label><div className="vector-input-grid">{numberInput("x minimum", object.xRange[0], (value) => onChange({ xRange: [value, object.xRange[1]], points: sampleSquare([value, object.xRange[1]]) } as Partial<ScientificObject>))}{numberInput("x maximum", object.xRange[1], (value) => onChange({ xRange: [object.xRange[0], value], points: sampleSquare([object.xRange[0], value]) } as Partial<ScientificObject>))}</div>{textInput("x-axis label", object.xLabel, (xLabel) => patch("xLabel", xLabel))}{textInput("y-axis label", object.yLabel, (yLabel) => patch("yLabel", yLabel))}<p>y = x² · {object.points.length} sampled points</p></>}
    {object.kind === "anatomy" && <>{textInput("Structure ID", object.structureId, (structureId) => patch("structureId", structureId))}{textInput("Body system", object.system, (system) => patch("system", system))}{textInput("Labels (comma-separated)", object.labels.join(", "), (labels) => patch("labels", labels.split(",").map((label) => label.trim()).filter(Boolean)))}</>}
    {object.kind === "concept" && <>{textInput("Title", object.title, (title) => patch("title", title))}<label>Definition<textarea value={object.definition} onChange={(event) => patch("definition", event.target.value)} /></label>{textInput("Course concept ID", object.conceptId ?? "", (conceptId) => patch("conceptId", conceptId))}</>}
    {object.kind === "relationship" && <>{labelSelect("From", object.fromId, objects.filter((item) => item.id !== object.id), (fromId) => patch("fromId", fromId))}{labelSelect("To", object.toId, objects.filter((item) => item.id !== object.id), (toId) => patch("toId", toId))}{textInput("Relationship", object.label, (label) => patch("label", label))}</>}
    {object.kind === "linked-note" && <>{textInput("Note title", object.title, (title) => patch("title", title))}<label>Excerpt<textarea value={object.excerpt} onChange={(event) => patch("excerpt", event.target.value)} /></label><button className="button-soft" onClick={() => onOpenNote(object.noteId)}>Open source note</button></>}
    {object.kind === "linked-document" && <>{textInput("Document title", object.title, (title) => patch("title", title))}{textInput("Document ID", object.documentId, (documentId) => patch("documentId", documentId))}<label>Excerpt<textarea value={object.excerpt} onChange={(event) => patch("excerpt", event.target.value)} /></label></>}
    {object.kind === "question" && <>{textInput("Course concept ID", object.conceptId ?? "", (conceptId) => patch("conceptId", conceptId))}<label>Question<textarea value={object.prompt} onChange={(event) => patch("prompt", event.target.value)} /></label><label>Answer<textarea value={object.answer ?? ""} onChange={(event) => patch("answer", event.target.value)} /></label></>}
    {object.kind === "flashcard" && <>{textInput("Course concept ID", object.conceptId ?? "", (conceptId) => patch("conceptId", conceptId))}<label>Front<textarea value={object.front} onChange={(event) => patch("front", event.target.value)} /></label><label>Back<textarea value={object.back} onChange={(event) => patch("back", event.target.value)} /></label></>}
  </div><footer><button className="button-primary" onClick={onClose}>Done</button></footer></section></div>;
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
function MoleculeGlyph({ molecule, bonds }: { molecule: Extract<ScientificObject, { kind: "molecule" }>; bonds: MoleculeBond[] }) {
  const width = Math.max(74, molecule.atoms.length * 46 + 18);
  const xAt = (index: number) => 24 + index * 46;
  return <svg className="molecule-glyph" viewBox={`0 0 ${width} 70`} role="img" aria-label={`${molecule.name} Lewis structure`}>
    {bonds.map((bond) => {
      const a = molecule.atoms.findIndex((atom) => atom.id === bond.from);
      const b = molecule.atoms.findIndex((atom) => atom.id === bond.to);
      if (a < 0 || b < 0 || a === b) return null;
      const left = Math.min(a, b), right = Math.max(a, b), x1 = xAt(left) + 11, x2 = xAt(right) - 11;
      const count = bond.order === 3 ? [-4, 0, 4] : bond.order === 2 ? [-2, 2] : [0];
      return <g key={bond.id} stroke="#818995" strokeWidth="1.5" strokeDasharray={bond.order === 1.5 ? "2 2" : undefined}>{count.map((offset) => <line key={offset} x1={x1} y1={31 + offset} x2={x2} y2={31 + offset} />)}</g>;
    })}
    {molecule.atoms.map((atom, index) => {
      const charge = formalChargeForAtom(atom, bondOrderSum(molecule, atom.id));
      return <g key={atom.id}><circle cx={xAt(index)} cy="31" r="12" fill="#fbf7f4" stroke="#d9c7b9" /><text x={xAt(index)} y="34" textAnchor="middle" fill="#875a43" fontSize="10" fontWeight="700">{atom.element}</text>{charge !== 0 && <text x={xAt(index) + 12} y="20" fill="#9a6548" fontSize="8">{formatCharge(charge)}</text>}{atom.nonbondingElectrons > 0 && <text x={xAt(index)} y="58" textAnchor="middle" fill="#65717e" fontSize="7">{"•".repeat(Math.min(atom.nonbondingElectrons, 8))}</text>}</g>;
    })}
  </svg>;
}
function VectorGlyph({ components }: { components: [number, number, number] }) { const max = Math.max(1, Math.abs(components[0]), Math.abs(components[1])); return <svg className="vector-glyph" viewBox="0 0 84 66" aria-label="Vector arrow"><line x1="42" y1="58" x2={42 + components[0] / max * 28} y2={58 - components[1] / max * 42} stroke="currentColor" strokeWidth="3" markerEnd="url(#vector-arrowhead)" /><defs><marker id="vector-arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" /></marker></defs></svg>; }
function GraphGlyph({ points }: { points: Array<[number, number]> }) { const xs = points.map(([x]) => x); const ys = points.map(([, y]) => y); const minX = Math.min(...xs, -1); const maxX = Math.max(...xs, 1); const minY = Math.min(...ys, -1); const maxY = Math.max(...ys, 1); const path = points.map(([x, y], index) => `${index ? "L" : "M"}${6 + (x - minX) / (maxX - minX) * 88},${50 - (y - minY) / (maxY - minY) * 42}`).join(" "); return <svg className="graph-glyph" viewBox="0 0 100 58" aria-label="Graph preview"><path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" /></svg>; }
function objectTitle(object: ScientificObject) { if (object.kind === "molecule") return object.name; if (object.kind === "equation") return "Equation"; if (object.kind === "vector" || object.kind === "force") return object.label; if (object.kind === "measurement") return object.label; if (object.kind === "atom") return object.label; if (object.kind === "bond") return object.label; if (object.kind === "concept") return object.title; if (object.kind === "relationship") return object.label; if (object.kind === "linked-note" || object.kind === "linked-document") return object.title; if (object.kind === "question") return "Practice question"; if (object.kind === "flashcard") return "Flashcard"; if (object.kind === "anatomy") return object.structureId || "Anatomy label"; return "Graph"; }
function formatCharge(charge: number) { return charge > 0 ? `+${charge}` : String(charge); }
function safeName(name: string) { return name.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "canvas"; }
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const link = Object.assign(window.document.createElement("a"), { href: url, download: filename }); link.click(); URL.revokeObjectURL(url); }
const elementOptions = (["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"] as Element[]).map((element) => <option key={element}>{element}</option>);
const bondOrders: BondOrder[] = [1, 1.5, 2, 3];
