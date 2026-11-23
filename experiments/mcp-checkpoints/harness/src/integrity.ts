export type Mutation = {
  id: string;
  actor: "user" | "agent";
  boardId: string;
  targetId: string;
  baseRevision: number;
  appliedRevision?: number;
  authority?: "board-authority" | "direct-document-write";
  outcome: "applied" | "rejected" | "duplicate" | "lost";
  sequence?: number;
  persisted?: boolean;
  broadcast?: boolean;
};

export type IntegrityTrace = {
  scenarioId: string;
  activeBoardId: string;
  mutations: Mutation[];
  finalPersistedBoard?: string;
  finalDisplayedBoard?: string;
  recoveredAfterReconnect?: boolean;
};

export type IntegrityResult = {
  lost: number;
  duplicates: number;
  staleAccepted: number;
  crossBoardViolations: number;
  revisionConsistent: boolean;
  sequenceConsistent: boolean;
  singlePath: boolean;
  displayedMatchesPersisted: boolean;
  recovered: boolean | null;
  pass: boolean;
};

export function evaluateIntegrity(trace: IntegrityTrace): IntegrityResult {
  const applied = trace.mutations.filter((m) => m.outcome === "applied");

  const lost = trace.mutations.filter(
    (m) => m.outcome === "lost" || (m.outcome === "applied" && m.persisted === false)
  ).length;
  const duplicates = trace.mutations.filter((m) => m.outcome === "duplicate").length;
  const crossBoardViolations = applied.filter(
    (m) => m.boardId !== trace.activeBoardId
  ).length;
  // A stale write through the normal authority is a stale-write defect. A
  // direct-document-write is a separate single-path defect, counted by
  // `singlePath`, so it is not double-counted here.
  const staleAccepted = applied.filter(
    (m) =>
      m.authority === "board-authority" &&
      m.baseRevision !== m.appliedRevision
  ).length;

  const increasing = (values: Array<number | undefined>): boolean =>
    values.every((value, index) => value !== undefined && (index === 0 || value > values[index - 1]!));

  return {
    lost,
    duplicates,
    staleAccepted,
    crossBoardViolations,
    revisionConsistent: increasing(applied.map((m) => m.appliedRevision)),
    sequenceConsistent: increasing(applied.map((m) => m.sequence)),
    singlePath: trace.mutations.every(
      (m) => m.authority === "board-authority"
    ),
    displayedMatchesPersisted:
      trace.finalDisplayedBoard === trace.finalPersistedBoard,
    recovered: trace.recoveredAfterReconnect ?? null,
    pass: crossBoardViolations === 0 && lost === 0 && staleAccepted === 0,
  };
}
