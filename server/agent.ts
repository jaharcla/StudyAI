import { ChatOllama } from "@langchain/ollama";
import { SystemMessage } from "@langchain/core/messages";
import { Annotation, StateGraph, START, END, addMessages } from "@langchain/langgraph";

const State = Annotation.Root({
  copilotkit: Annotation<{ context?: Array<{ description: string; value: unknown }> }>({ reducer: (_, next) => next, default: () => ({ context: [] }) }),
  messages: Annotation<any[]>({ reducer: addMessages, default: () => [] }),
});

async function tutor(state: typeof State.State) {
  const contexts = state.copilotkit?.context ?? [];
  const context = JSON.stringify(contexts);
  const selection = contexts.find((item) => item.description === "StudyAI selected model")?.value;
  const selected = typeof selection === "string" ? JSON.parse(selection) as { model?: string } : selection as { model?: string } | undefined;
  const model = new ChatOllama({
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    model: selected?.model || process.env.OLLAMA_MODEL || "qwen3:latest",
    temperature: 0.2,
  });
  const response = await model.invoke([
    new SystemMessage(`You are StudyAI, a careful scientific tutor. Use supplied course and canvas context. State uncertainty. Never infer the meaning of freehand marks from coordinates alone. Canvas/workspace metadata: ${context}`),
    ...state.messages,
  ]);
  return { messages: [response] };
}

export const graph = new StateGraph(State).addNode("tutor", tutor).addEdge(START, "tutor").addEdge("tutor", END).compile();
