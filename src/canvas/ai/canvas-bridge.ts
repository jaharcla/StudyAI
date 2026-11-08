import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import type { Bounds, Store } from "@quickdrawjs/core";
import type { ScientificObject } from "../model";
import { canvasActionSchema, canvasReadSchema, proposeCanvasAction, readCanvasState, type CanvasProposal } from "./canvas-actions";
import { buildCanvasAIContext, type CanvasScope } from "./canvas-context";

export type QuickdrawAIBridgeOptions = {
  store: Store | null;
  selectedIds: readonly string[];
  viewport: Bounds;
  objects: readonly ScientificObject[];
  scope: CanvasScope;
  onProposal: (proposal: CanvasProposal) => void;
  maxContextChars?: number;
};

export function useQuickdrawAIBridge(options: QuickdrawAIBridgeOptions): void {
  const context = options.store ? buildCanvasAIContext({
    source: options.store,
    selectedIds: options.selectedIds,
    viewport: options.viewport,
    objects: options.objects,
    scope: options.scope,
    maxChars: options.maxContextChars,
  }) : { scope: options.scope, viewport: options.viewport, selected: [], visible: [], nearbyObjects: [], spatialRelationships: [], truncated: false };
  useAgentContext({ description: "Active Quickdraw board context", value: context as never });
  useFrontendTool({
    name: "propose_canvas_action",
    description: "Propose up to 30 native QuickDraw shape actions for user review. Supports createShape, createText, createArrow, updateShape, deleteShape, moveShape, highlightShape and selectShapes. groupShapes is unsupported by QuickDraw. Every proposal is scoped to the current board and is not applied until approved.",
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
    description: "Read the active QuickDraw board's native shapes, IDs, page coordinates, types and properties. Pass the current boardId from the active canvas context.",
    parameters: canvasReadSchema,
    handler: async ({ boardId }) => {
      try { if (!options.store) throw new Error("The active canvas is not ready."); return readCanvasState(options.store, options.scope.boardId, boardId); }
      catch (error) { return { error: error instanceof Error ? error.message : "Canvas state unavailable." }; }
    },
  }, [options.store, options.scope.boardId]);
}
