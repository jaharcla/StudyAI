import { describe, expect, it } from "vitest";
import { evaluateIntegrity, type IntegrityTrace } from "./integrity";

const clean: IntegrityTrace = {
  scenarioId: "clean",
  activeBoardId: "board-A",
  finalPersistedBoard: "board-A",
  finalDisplayedBoard: "board-A",
  recoveredAfterReconnect: true,
  mutations: [
    { id: "m1", actor: "user", boardId: "board-A", targetId: "s1", baseRevision: 1, appliedRevision: 1, authority: "board-authority", outcome: "applied", sequence: 1, persisted: true, broadcast: true },
    { id: "m2", actor: "agent", boardId: "board-A", targetId: "s2", baseRevision: 2, appliedRevision: 2, authority: "board-authority", outcome: "applied", sequence: 2, persisted: true, broadcast: true },
  ],
};

describe("evaluateIntegrity", () => {
  it("passes a clean trace against the three campaign pass criteria", () => {
    const result = evaluateIntegrity(clean);
    expect(result.crossBoardViolations).toBe(0);
    expect(result.lost).toBe(0);
    expect(result.staleAccepted).toBe(0);
    expect(result.singlePath).toBe(true);
    expect(result.displayedMatchesPersisted).toBe(true);
    expect(result.pass).toBe(true);
  });

  it("flags stale acceptance, cross-board writes, loss, replay and a second mutation path", () => {
    const trace: IntegrityTrace = {
      ...clean,
      scenarioId: "dirty",
      finalDisplayedBoard: "board-B",
      recoveredAfterReconnect: false,
      mutations: [
        ...clean.mutations,
        { id: "m3", actor: "agent", boardId: "board-B", targetId: "s3", baseRevision: 1, appliedRevision: 5, authority: "board-authority", outcome: "applied", sequence: 3, persisted: true, broadcast: true },
        { id: "m4", actor: "agent", boardId: "board-A", targetId: "s4", baseRevision: 1, appliedRevision: 6, authority: "direct-document-write", outcome: "applied", sequence: 4, persisted: true, broadcast: false },
        { id: "m5", actor: "user", boardId: "board-A", targetId: "s5", baseRevision: 5, appliedRevision: 5, authority: "board-authority", outcome: "lost", sequence: 5, persisted: false, broadcast: false },
        { id: "m2", actor: "agent", boardId: "board-A", targetId: "s2", baseRevision: 2, appliedRevision: 2, authority: "board-authority", outcome: "duplicate", sequence: 2, persisted: true, broadcast: true },
      ],
    };
    const result = evaluateIntegrity(trace);
    expect(result.crossBoardViolations).toBe(1);
    expect(result.staleAccepted).toBe(1);
    expect(result.lost).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.singlePath).toBe(false);
    expect(result.displayedMatchesPersisted).toBe(false);
    expect(result.recovered).toBe(false);
    expect(result.pass).toBe(false);
  });
});
