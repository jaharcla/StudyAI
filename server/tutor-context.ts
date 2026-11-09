type ContextItem = { description: string; value: unknown };

const protectedDescriptions = new Set([
  "StudyAI current workspace and structured canvas metadata",
  "StudyAI selected model",
  "StudyAI active scientific canvas objects",
  "Active Quickdraw board context",
  "StudyAI canvas analysis result",
]);

export class TutorContextBudgetError extends Error {
  constructor(readonly estimatedTokens: number, readonly budgetTokens: number) {
    super("The current canvas and conversation exceed the Tutor context budget.");
    this.name = "TutorContextBudgetError";
  }
}

export function getTutorContextBudget(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TUTOR_CONTEXT_BUDGET;
  if (raw === undefined || raw.trim() === "") return 16_384;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 512 || value > 131_072) throw new Error("TUTOR_CONTEXT_BUDGET must be an integer from 512 through 131072.");
  return value;
}

export function budgetTutorContext(input: {
  systemInstructions: string;
  contexts: ContextItem[];
  evidence: unknown;
  conversation: any[];
  budgetTokens: number;
}) {
  const protectedContexts = input.contexts.filter((item) => protectedDescriptions.has(item.description));
  const optionalContexts = input.contexts.filter((item) => !protectedDescriptions.has(item.description));
  const turns = conversationTurns(input.conversation);
  const latestTurn = turns.at(-1) ?? [];
  const latestUser = [...latestTurn].reverse().find(isHuman);
  const requiredConversation = latestUser ? latestTurn.slice(latestTurn.indexOf(latestUser)) : [];
  let contexts = protectedContexts;
  let conversation = requiredConversation;
  const base = measure(input.systemInstructions, contexts, input.evidence, conversation);
  if (base > input.budgetTokens) throw new TutorContextBudgetError(base, input.budgetTokens);

  for (const item of optionalContexts) {
    const candidate = [...contexts, item];
    if (measure(input.systemInstructions, candidate, input.evidence, conversation) <= input.budgetTokens) contexts = candidate;
  }

  let includedTurns = 1;
  for (let index = turns.length - 2; index >= 0; index--) {
    const candidate = [...turns[index], ...conversation];
    if (measure(input.systemInstructions, contexts, input.evidence, candidate) > input.budgetTokens) break;
    conversation = candidate;
    includedTurns++;
  }

  return {
    contexts,
    conversation,
    canvasJson: JSON.stringify(contexts),
    evidenceJson: JSON.stringify(input.evidence),
    estimatedTokens: measure(input.systemInstructions, contexts, input.evidence, conversation),
    omittedContextCount: input.contexts.length - contexts.length,
    omittedTurnCount: Math.max(0, turns.length - includedTurns),
  };
}

export function estimateTutorMessageTokens(messages: unknown[]): number {
  const [system, ...conversation] = messages as Array<{ content?: unknown }>;
  const systemText = typeof system?.content === "string" ? system.content : JSON.stringify(system?.content ?? "");
  return Math.ceil((systemText.length + JSON.stringify(conversation).length + 128) / 4);
}

function conversationTurns(messages: any[]): any[][] {
  const turns: any[][] = [];
  for (const message of messages) {
    if (isHuman(message) || turns.length === 0) turns.push([]);
    turns[turns.length - 1].push(message);
  }
  return turns.filter((turn) => turn.length > 0);
}

function isHuman(message: any): boolean {
  return message?._getType?.() === "human" || message?.type === "human";
}

function measure(system: string, contexts: ContextItem[], evidence: unknown, conversation: any[]): number {
  const chars = system.length + JSON.stringify(contexts).length + JSON.stringify(evidence).length + JSON.stringify(conversation).length + 128;
  return Math.ceil(chars / 4);
}
