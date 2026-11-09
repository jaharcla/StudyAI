type ContextItem = { description: string; value: unknown };
type ContextMessage = { _getType?: () => string; type?: string; role?: string; name?: string; content?: unknown };

export type TutorContextBudgetDiagnostics = {
  phase: string;
  budgetTokens: number;
  estimatedTokens: number;
  totalCharacters: number;
  systemInstructionCharacters?: number;
  contextCharacters?: number;
  contextItems?: Array<{ description: string; characters: number; included: boolean }>;
  evidenceCharacters?: number;
  conversationCharacters?: number;
  messages: Array<{ type: string; name?: string; contentCharacters: number }>;
};

const protectedDescriptions = new Set([
  "StudyAI current workspace and structured canvas metadata",
  "StudyAI selected model",
  "StudyAI active scientific canvas objects",
  "Active Quickdraw board context",
  "StudyAI canvas analysis result",
]);

export class TutorContextBudgetError extends Error {
  constructor(readonly estimatedTokens: number, readonly budgetTokens: number, readonly diagnostics?: TutorContextBudgetDiagnostics) {
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
  if (base > input.budgetTokens) throw new TutorContextBudgetError(base, input.budgetTokens, diagnoseTutorContext(input, contexts, conversation, "protected_context_preflight"));

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

export function diagnoseTutorMessages(messages: unknown[], budgetTokens: number): TutorContextBudgetDiagnostics {
  const [system, ...conversation] = messages as ContextMessage[];
  const systemText = typeof system?.content === "string" ? system.content : JSON.stringify(system?.content ?? "");
  const conversationCharacters = JSON.stringify(conversation).length;
  const totalCharacters = systemText.length + conversationCharacters + 128;
  return {
    phase: "provider_message_preflight",
    budgetTokens,
    estimatedTokens: Math.ceil(totalCharacters / 4),
    totalCharacters,
    systemInstructionCharacters: systemText.length,
    conversationCharacters,
    messages: conversation.map((message) => ({
      type: message._getType?.() ?? message.type ?? message.role ?? "unknown",
      ...(message.name ? { name: message.name } : {}),
      contentCharacters: messageContentCharacters(message.content),
    })),
  };
}

function diagnoseTutorContext(input: {
  systemInstructions: string;
  contexts: ContextItem[];
  evidence: unknown;
  budgetTokens: number;
}, includedContexts: ContextItem[], conversation: ContextMessage[], phase: string): TutorContextBudgetDiagnostics {
  const contextCharacters = JSON.stringify(includedContexts).length;
  const evidenceCharacters = JSON.stringify(input.evidence).length;
  const conversationCharacters = JSON.stringify(conversation).length;
  const totalCharacters = input.systemInstructions.length + contextCharacters + evidenceCharacters + conversationCharacters + 128;
  return {
    phase,
    budgetTokens: input.budgetTokens,
    estimatedTokens: Math.ceil(totalCharacters / 4),
    totalCharacters,
    systemInstructionCharacters: input.systemInstructions.length,
    contextCharacters,
    contextItems: input.contexts.map((item) => ({
      description: item.description,
      characters: serializedCharacters(item.value),
      included: includedContexts.includes(item),
    })),
    evidenceCharacters,
    conversationCharacters,
    messages: conversation.map((message) => ({
      type: message._getType?.() ?? message.type ?? message.role ?? "unknown",
      ...(message.name ? { name: message.name } : {}),
      contentCharacters: messageContentCharacters(message.content),
    })),
  };
}

function serializedCharacters(value: unknown): number {
  try { return JSON.stringify(value)?.length ?? 0; } catch { return 0; }
}

function messageContentCharacters(value: unknown): number {
  return typeof value === "string" ? value.length : serializedCharacters(value);
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
