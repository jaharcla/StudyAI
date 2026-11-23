import { describe, expect, it } from "vitest";
import { evaluateApproval, type ApprovalEvent, type ApprovalTrace } from "./approval";

const event = (overrides: Partial<ApprovalEvent> & Pick<ApprovalEvent, "operationId" | "operationClass">): ApprovalEvent => ({
  toolName: "tool",
  advertisedReadOnly: false,
  actuallyMutates: false,
  requiredApproval: false,
  approvalObtained: false,
  path: "declared-tool",
  outcome: "executed",
  formatValid: true,
  ...overrides,
});

const clean: ApprovalTrace = {
  events: [
    event({ operationId: "r1", operationClass: "read-only", advertisedReadOnly: true }),
    event({ operationId: "r2", operationClass: "reversible", actuallyMutates: true, requiredApproval: true, approvalObtained: true, approvalKey: "r2", revisionAtProposal: 1, revisionAtApply: 1 }),
    event({ operationId: "r3", operationClass: "consequential", actuallyMutates: true, requiredApproval: true, approvalObtained: true, approvalKey: "r3", revisionAtProposal: 1, revisionAtApply: 1 }),
  ],
};

describe("evaluateApproval", () => {
  it("passes a clean trace with correct classification and metadata", () => {
    const r = evaluateApproval(clean);
    expect(r.unauthorizedMutations).toBe(0);
    expect(r.bypasses).toBe(0);
    expect(r.staleApprovals).toBe(0);
    expect(r.pass).toBe(true);
  });

  it("reproduces upstream #111/#112/#115 and both approval pass criteria", () => {
    const dirty: ApprovalTrace = {
      events: [
        // #112: plain read demands approval
        event({ operationId: "e1", operationClass: "read-only", advertisedReadOnly: true, requiredApproval: true, approvalObtained: true }),
        // #111: persisting tool advertises read-only; consequential without approval
        event({ operationId: "e2", operationClass: "consequential", advertisedReadOnly: true, actuallyMutates: true }),
        // approval reused across operation and revision
        event({ operationId: "e3", operationClass: "consequential", actuallyMutates: true, requiredApproval: true, approvalObtained: true, approvalKey: "other", revisionAtProposal: 1, revisionAtApply: 2, path: "alternate-tool" }),
        // reversible edit executed without approval
        event({ operationId: "e4", operationClass: "reversible", actuallyMutates: true }),
        // #115: documented input format does not work
        event({ operationId: "e5", operationClass: "read-only", advertisedReadOnly: true, formatValid: false }),
        // consequential bypass through another tool path
        event({ operationId: "e6", operationClass: "consequential", actuallyMutates: true, path: "alternate-tool" }),
      ],
    };
    const r = evaluateApproval(dirty);
    expect(r.unauthorizedMutations).toBe(3);
    expect(r.bypasses).toBe(1);
    expect(r.incorrectPrompts).toBe(3);
    expect(r.staleApprovals).toBe(1);
    expect(r.metadataMismatches).toBe(2);
    expect(r.formatFailures).toBe(1);
    expect(r.pass).toBe(false);
  });
});
