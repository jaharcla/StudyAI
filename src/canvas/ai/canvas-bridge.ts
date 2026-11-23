import { useEffect, useState } from "react";
import { z } from "zod";
import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import type { Bounds, Snapshot, Store } from "@quickdrawjs/core";
import type { ScientificObject } from "../model";
import type { CanvasSceneGraph } from "../spatial/types";
import { canvasActionSchema, canvasReadSchema, proposeCanvasAction, readCanvasState, type CanvasProposal } from "./canvas-actions";
import { boundedSceneSlice, CANVAS_DESIGN_GUIDE, canvasDescribeSchema, canvasEvidenceSearchSchema, canvasSceneReadSchema, describeCanvas, invalidateCanvasSceneCache, readCanvasInkSchema, requestCanvasInk, requestCanvasScene, searchCanvasEvidence, searchCourseCanvasEvidence } from "./scene-tools";
import { compileTeachingScene, teachingSceneSchema } from "./teaching-scene";
import { buildTutorCanvasContext } from "./tutor-canvas-context";
import { boardOccupancy, buildCanvasAIContext, type CanvasScope } from "./canvas-context";

export type QuickdrawAIBridgeOptions = {
  store: Store | null;
  snapshot?: Snapshot | null;
  selectedIds: readonly string[];
  viewport: Bounds;
  objects: readonly ScientificObject[];
  scope: CanvasScope;
  onProposal: (proposal: CanvasProposal) => void;
  maxContextChars?: number;
};

export function useQuickdrawAIBridge(options: QuickdrawAIBridgeOptions): void {
  const [scene, setScene] = useState<CanvasSceneGraph | null>(null);
  useEffect(() => {
    let cancelled = false;
    setScene(null);
    if (!options.scope.boardId || options.scope.revision === undefined) return;
    requestCanvasScene(options.scope).then((graph) => { if (!cancelled) setScene(graph); }).catch(() => { if (!cancelled) setScene(null); });
    return () => { cancelled = true; };
  }, [options.scope.boardId, options.scope.courseId, options.scope.lessonId, options.scope.revision]);
  const source = options.store ?? options.snapshot ?? null;
  const legacy = source ? buildCanvasAIContext({
    source,
    selectedIds: options.selectedIds,
    viewport: options.viewport,
    objects: options.objects,
    scope: options.scope,
    maxChars: options.maxContextChars,
  }) : null;
  const shapes = legacy ? { ...legacy, nearbyObjects: [], spatialRelationships: [] } : null;
  const tutorContext = buildTutorCanvasContext({ scene, shapes, selectedIds: options.selectedIds, viewport: options.viewport });
  useAgentContext({ description: "Active canvas scene", value: tutorContext });
  useFrontendTool({
    name: "propose_canvas_action",
    description: "Consequential: requires user approval. Propose up to 30 native QuickDraw shape actions for review. Supports createShape, createText, createArrow, updateShape, deleteShape, moveShape, highlightShape and selectShapes. groupShapes is unsupported by QuickDraw. Every proposal is scoped to the current board and is not applied until approved.",
    parameters: canvasActionSchema,
    handler: async (action) => {
      try {
        if (!options.store) throw new Error("The active canvas is not ready.");
        const proposal = proposeCanvasAction(options.store, options.scope.boardId, action, options.scope.revision);
        options.onProposal(proposal);
        return { status: "pending_user_review", proposalId: proposal.id, description: proposal.description, requiresConfirmation: proposal.requiresConfirmation };
      } catch (error) {
        return { status: "rejected", error: error instanceof Error ? error.message : "Invalid canvas action." };
      }
    },
  }, [options.store, options.scope.boardId, options.scope.revision, options.onProposal]);
  useFrontendTool({
    name: "get_canvas_state",
    description: "Read native shapes from the active QuickDraw board. Use shapeIds from the current canvas context for a targeted follow-up read; pass the current boardId.",
    parameters: canvasReadSchema,
    handler: async ({ boardId, shapeIds }) => {
      try { if (!options.store) throw new Error("The active canvas is not ready."); return readCanvasState(options.store, options.scope.boardId, boardId, options.selectedIds, shapeIds); }
      catch (error) { return { error: error instanceof Error ? error.message : "Canvas state unavailable." }; }
    },
  }, [options.store, options.scope.boardId]);
  useFrontendTool({
    name: "get_canvas_scene",
    description: "Read a bounded, revision-bound spatial scene graph for the active board. Use it for what is near, overlapping, or spatially related. Node IDs are read-only; use raw QuickDraw/science IDs for proposals.",
    parameters: canvasSceneReadSchema,
    handler: async ({ boardId, maxNodes, nodeKinds }) => {
      try {
        if (boardId !== options.scope.boardId) throw new Error("The active board changed.");
        const graph = await requestCanvasScene(options.scope);
        return boundedSceneSlice(graph, { maxNodes, nodeKinds });
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Canvas scene unavailable." };
      }
    },
  }, [options.scope.boardId, options.scope.courseId, options.scope.lessonId, options.scope.revision]);
  useFrontendTool({
    name: "read_canvas_ink",
    description: "Transcribe up to eight requested freehand groups for the active board. Returns source-linked text with confidence and an explicit unconfirmed flag. Call only for groups whose text the answer depends on; do not transcribe the whole board.",
    parameters: readCanvasInkSchema,
    handler: async ({ boardId, groupIds, profile }) => {
      try {
        if (boardId !== options.scope.boardId) throw new Error("The active board changed.");
        const result = await requestCanvasInk(options.scope, { groupIds, profile });
        invalidateCanvasSceneCache();
        requestCanvasScene(options.scope).then((graph) => setScene(graph)).catch(() => undefined);
        return result;
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Canvas ink read unavailable." };
      }
    },
  }, [options.scope.boardId, options.scope.courseId, options.scope.lessonId, options.scope.revision]);
  useFrontendTool({
    name: "search_canvas_evidence",
    description: "Search revision-bound scene evidence by text. Pass the active boardId for this board's current revision, or omit boardId to search every board in the current course whose latest revision has a built scene; pass lessonId to narrow a course search to one lesson. Returns source-linked nodes with incident edges and board attribution. Results are evidence, not verified labels.",
    parameters: canvasEvidenceSearchSchema,
    handler: async ({ boardId, lessonId, query, limit }) => {
      try {
        if (boardId && boardId !== options.scope.boardId) throw new Error("The active board changed.");
        return boardId
          ? await searchCanvasEvidence(options.scope, query, limit)
          : await searchCourseCanvasEvidence({ courseId: options.scope.courseId, lessonId }, query, limit);
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Canvas evidence search unavailable." };
      }
    },
  }, [options.scope.boardId, options.scope.courseId, options.scope.lessonId, options.scope.revision]);
  useFrontendTool({
    name: "describe_canvas",
    description: "Read-only. Plain-text summary of the active board's revision-bound scene: counts, bounds, ordered node lines, and advisory reader-check warnings for overlaps or shapes outside the viewport. Use for a cheap overview before get_canvas_scene.",
    parameters: canvasDescribeSchema,
    handler: async ({ boardId }) => {
      try {
        if (boardId !== options.scope.boardId) throw new Error("The active board changed.");
        return describeCanvas(await requestCanvasScene(options.scope), options.viewport);
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Canvas description unavailable." };
      }
    },
  }, [options.scope.boardId, options.scope.courseId, options.scope.lessonId, options.scope.revision, options.viewport]);
  useFrontendTool({
    name: "read_design_guide",
    description: "Read-only. Returns the canonical layout and annotation guide for the scientific canvas. Read it before proposing a diagram so shapes, arrows, and captions follow the same conventions.",
    parameters: z.object({}).strict(),
    handler: async () => ({ guide: CANVAS_DESIGN_GUIDE }),
  }, []);
  useFrontendTool({
    name: "propose_teaching_scene",
    description: "Consequential: requires user approval. Compile a semantic teaching scene (nodes, labeled arrows, ordered steps) into a review-gated QuickDraw action batch. Supply meaning and stable node ids; the app computes bounded layout positions. At most 8 nodes, 10 edges, and 4 steps.",
    parameters: teachingSceneSchema,
    handler: async (input) => {
      try {
        if (input.boardId !== options.scope.boardId) throw new Error("The active board changed.");
        if (!options.store) throw new Error("The active canvas is not ready.");
        // Occupancy comes from the canvas context's own bounds math, so placement respects what is
        // really on the board — including rotated shapes, ink, and text whose extent is estimated.
        const batch = compileTeachingScene(input, {
          existingShapeIds: new Set(options.store.ids()),
          occupancy: boardOccupancy(options.store),
          viewport: { x: options.viewport.x, y: options.viewport.y, width: options.viewport.w, height: options.viewport.h },
        });
        const proposal = proposeCanvasAction(options.store, options.scope.boardId, batch, options.scope.revision);
        options.onProposal(proposal);
        return { status: "pending_user_review", proposalId: proposal.id, description: proposal.description, requiresConfirmation: proposal.requiresConfirmation };
      } catch (error) {
        return { status: "rejected", error: error instanceof Error ? error.message : "Invalid teaching scene." };
      }
    },
  }, [options.store, options.scope.boardId, options.scope.revision, options.onProposal]);
}
