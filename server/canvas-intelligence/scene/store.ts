import type Database from "better-sqlite3";
import { CanvasSceneGraphSchema, type CanvasSceneEdge, type CanvasSceneGraph, type CanvasSceneNode } from "../../../src/canvas/spatial/types.js";

export function initializeCanvasSceneSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_scene_graphs (
      board_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      revision_hash TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      graph_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (board_id, revision_hash)
    );
    CREATE TABLE IF NOT EXISTS canvas_scene_index (
      id INTEGER PRIMARY KEY,
      board_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      revision_hash TEXT NOT NULL,
      node_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      node_json TEXT NOT NULL,
      UNIQUE (board_id, revision_hash, node_id)
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS canvas_scene_search USING fts5(
      text,
      board_id UNINDEXED,
      course_id UNINDEXED,
      lesson_id UNINDEXED,
      revision_hash UNINDEXED,
      node_id UNINDEXED
    );
  `);
}

export function saveCanvasSceneGraph(db: Database.Database, graph: CanvasSceneGraph): void {
  const parsed = CanvasSceneGraphSchema.parse(graph);
  const saveGraph = db.prepare("INSERT OR REPLACE INTO canvas_scene_graphs(board_id,course_id,lesson_id,revision,revision_hash,snapshot_hash,graph_json) VALUES(?,?,?,?,?,?,?)");
  const deleteIndex = db.prepare("DELETE FROM canvas_scene_index WHERE board_id=? AND revision_hash=?");
  const deleteSearch = db.prepare("DELETE FROM canvas_scene_search WHERE board_id=? AND revision_hash=?");
  const insertIndex = db.prepare("INSERT INTO canvas_scene_index(board_id,course_id,lesson_id,revision,revision_hash,node_id,kind,text,node_json) VALUES(?,?,?,?,?,?,?,?,?)");
  const insertSearch = db.prepare("INSERT INTO canvas_scene_search(text,board_id,course_id,lesson_id,revision_hash,node_id) VALUES(?,?,?,?,?,?)");
  const transaction = db.transaction(() => {
    saveGraph.run(parsed.scope.boardId, parsed.scope.courseId, parsed.scope.lessonId, parsed.revision, parsed.revisionHash, parsed.snapshotHash, JSON.stringify(parsed));
    deleteIndex.run(parsed.scope.boardId, parsed.revisionHash);
    deleteSearch.run(parsed.scope.boardId, parsed.revisionHash);
    for (const node of parsed.nodes) {
      if (!node.text || !node.text.trim()) continue;
      insertIndex.run(parsed.scope.boardId, parsed.scope.courseId, parsed.scope.lessonId, parsed.revision, parsed.revisionHash, node.id, node.kind, node.text, JSON.stringify(node));
      insertSearch.run(node.text, parsed.scope.boardId, parsed.scope.courseId, parsed.scope.lessonId, parsed.revisionHash, node.id);
    }
  });
  transaction.immediate();
}

export function loadCanvasSceneGraph(db: Database.Database, boardId: string, revisionHash: string): CanvasSceneGraph | null {
  const row = db.prepare("SELECT graph_json FROM canvas_scene_graphs WHERE board_id=? AND revision_hash=?").get(boardId, revisionHash) as { graph_json: string } | undefined;
  return row ? CanvasSceneGraphSchema.parse(JSON.parse(row.graph_json)) : null;
}

export type CanvasSceneSearchScope = { courseId: string; lessonId?: string; boardId?: string; revisionHash?: string };

export type CanvasSceneSearchHit = { boardId: string; revisionHash: string; revision: number; node: CanvasSceneNode; edges: CanvasSceneEdge[] };

const MAX_SEARCH_LIMIT = 20;
const MAX_SEARCH_EDGES = 40;

export function searchCanvasScene(db: Database.Database, scope: CanvasSceneSearchScope, query: string, limit = 8): { nodes: CanvasSceneNode[]; edges: CanvasSceneEdge[]; warnings: string[]; truncated: boolean } {
  const terms = sanitizeQuery(query);
  if (!terms.length) return { nodes: [], edges: [], warnings: ["Empty canvas scene query."], truncated: false };
  const capped = Math.max(1, Math.min(MAX_SEARCH_LIMIT, limit));
  const clauses = ["canvas_scene_search MATCH ?", "course_id = ?"];
  const values: Array<string | number> = [terms.map((term) => `"${term}"`).join(" OR "), scope.courseId];
  if (scope.lessonId) { clauses.push("lesson_id = ?"); values.push(scope.lessonId); }
  if (scope.boardId) { clauses.push("board_id = ?"); values.push(scope.boardId); }
  if (scope.revisionHash) { clauses.push("revision_hash = ?"); values.push(scope.revisionHash); }
  const rows = db.prepare(`SELECT node_id,board_id,revision_hash FROM canvas_scene_search WHERE ${clauses.join(" AND ")} ORDER BY bm25(canvas_scene_search) LIMIT ?`).all(...values, capped) as Array<{ node_id: string; board_id: string; revision_hash: string }>;
  const nodes: CanvasSceneNode[] = [];
  const edges = new Map<string, CanvasSceneEdge>();
  const warnings: string[] = [];
  for (const row of rows) {
    const graph = loadCanvasSceneGraph(db, row.board_id, row.revision_hash);
    if (!graph) { warnings.push("A matching scene graph could not be loaded."); continue; }
    const node = graph.nodes.find((item) => item.id === row.node_id);
    if (!node) continue;
    nodes.push(node);
    for (const edge of graph.edges) if (edge.from === node.id || edge.to === node.id) edges.set(edge.id, edge);
  }
  const cappedEdges = [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_SEARCH_EDGES);
  return { nodes, edges: cappedEdges, warnings: [...new Set(warnings)], truncated: rows.length >= capped || edges.size > cappedEdges.length };
}

/**
 * Search every board in a course that has a scene graph for its persisted current revision.
 * Older revisions remain indexed for exact-revision reads but never surface in course-wide search.
 */
export function searchCurrentCourseCanvasScene(db: Database.Database, scope: { courseId: string; lessonId?: string; boardId?: string }, query: string, limit = 8): { hits: CanvasSceneSearchHit[]; warnings: string[]; truncated: boolean } {
  const terms = sanitizeQuery(query);
  if (!terms.length) return { hits: [], warnings: ["Empty canvas scene query."], truncated: false };
  const capped = Math.max(1, Math.min(MAX_SEARCH_LIMIT, limit));
  const filters = ["canvas_scene_search.course_id = ?", "canvases.course_id = canvas_scene_search.course_id", "canvases.revision = canvas_scene_graphs.revision"];
  const values: Array<string | number> = [terms.map((term) => `"${term}"`).join(" OR "), scope.courseId];
  if (scope.lessonId) { filters.push("canvas_scene_search.lesson_id = ?"); values.push(scope.lessonId); }
  if (scope.boardId) { filters.push("canvas_scene_search.board_id = ?"); values.push(scope.boardId); }
  const rows = db.prepare(`
    SELECT canvas_scene_search.node_id AS node_id, canvas_scene_search.board_id AS board_id, canvas_scene_search.revision_hash AS revision_hash
    FROM canvas_scene_search
    JOIN canvas_scene_graphs ON canvas_scene_graphs.board_id = canvas_scene_search.board_id AND canvas_scene_graphs.revision_hash = canvas_scene_search.revision_hash
    JOIN canvases ON canvases.id = canvas_scene_graphs.board_id
    WHERE canvas_scene_search MATCH ? AND ${filters.join(" AND ")}
    ORDER BY bm25(canvas_scene_search) LIMIT ?
  `).all(...values, capped) as Array<{ node_id: string; board_id: string; revision_hash: string }>;
  const graphs = new Map<string, CanvasSceneGraph | null>();
  const hits: CanvasSceneSearchHit[] = [];
  const warnings: string[] = [];
  let edgeBudget = MAX_SEARCH_EDGES;
  for (const row of rows) {
    const key = `${row.board_id}\u0000${row.revision_hash}`;
    if (!graphs.has(key)) graphs.set(key, loadCanvasSceneGraph(db, row.board_id, row.revision_hash));
    const graph = graphs.get(key);
    if (!graph) { warnings.push("A matching scene graph could not be loaded."); continue; }
    const node = graph.nodes.find((item) => item.id === row.node_id);
    if (!node) continue;
    const edges = edgeBudget > 0
      ? graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.min(8, edgeBudget))
      : [];
    edgeBudget -= edges.length;
    hits.push({ boardId: row.board_id, revisionHash: row.revision_hash, revision: graph.revision, node, edges });
  }
  return { hits, warnings: [...new Set(warnings)], truncated: rows.length >= capped || edgeBudget <= 0 };
}

function sanitizeQuery(query: string): string[] {
  return String(query ?? "").replace(/["*:^(){}[\]]/g, " ").split(/\s+/).map((term) => term.trim()).filter((term) => term.length >= 2).slice(0, 20);
}
