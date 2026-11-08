import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import type { Bounds, Store } from "@quickdrawjs/core";
import type { ScientificObject } from "../model";
import { canvasActionSchema, proposeCanvasAction, type CanvasProposal } from "./canvas-actions";
import { buildCanvasAIContext, type CanvasScope } from "./canvas-context";

export type QuickdrawAIBridgeOptions = {
  store: Store;
  selectedIds: readonly string[];
  viewport: Bounds;
  objects: readonly ScientificObject[];
  scope: CanvasScope;
  onProposal: (proposal: CanvasProposal) => void;
  maxContextChars?: number;
};

export function useQuickdrawAIBridge(options: QuickdrawAIBridgeOptions): void {
  const context = buildCanvasAIContext({
    source: options.store,
    selectedIds: options.selectedIds,
    viewport: options.viewport,
    objects: options.objects,
    scope: options.scope,
    maxChars: options.maxContextChars,
  });
  useAgentContext({ description: "Active Quickdraw board context", value: context as never });
  useFrontendTool({
    name: "propose_canvas_action",
    description: "Propose a validated native Quickdraw shape action. The action is only queued for user review and does not change the board.",
    parameters: canvasActionSchema,
    handler: async (action) => {
      try {
        const proposal = proposeCanvasAction(options.store, options.scope.boardId, action);
        options.onProposal(proposal);
        return { status: "pending_user_review", proposalId: proposal.id, description: proposal.description };
      } catch (error) {
        return { status: "rejected", error: error instanceof Error ? error.message : "Invalid canvas action." };
      }
    },
  }, [options.store, options.scope.boardId, options.onProposal]);
}
