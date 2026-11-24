import type { BaseEvent } from "@ag-ui/client";
import { EventType } from "@ag-ui/client";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { filter, map, type Observable } from "rxjs";

/**
 * Student-facing guard for the CopilotKit AG-UI event stream.
 *
 * Evidence: mock student rerun 2026-11-24 (thread 1574689544459124746). The
 * model streams private reasoning deltas; @ag-ui/langgraph turns them into
 * `REASONING_MESSAGE_*` events, which CopilotKit renders as "Thinking…" /
 * "Thought for …" blocks. Those events leave the server before agent.ts
 * shapes the final answer, so the answer-level strip cannot hide them.
 *
 * API proof in the installed versions (CopilotKit 1.85.0, @ag-ui/client 1.0.2):
 * - `LangGraphAgent.run(input): Observable<BaseEvent>` —
 *   node_modules/@copilotkit/runtime/dist/lib/runtime/agent-integrations/langgraph/agent.d.cts:20
 * - `EventType.REASONING_*` and `BaseEvent` —
 *   node_modules/@ag-ui/client/dist/index.d.ts:759
 * - rxjs 7.8.1 pipe operators — node_modules/rxjs/dist/types/index.d.ts
 */

const REASONING_EVENT_TYPES = new Set<string>([
  EventType.REASONING_START,
  EventType.REASONING_END,
  EventType.REASONING_MESSAGE_START,
  EventType.REASONING_MESSAGE_CONTENT,
  EventType.REASONING_MESSAGE_END,
  EventType.REASONING_MESSAGE_CHUNK,
  EventType.REASONING_ENCRYPTED_VALUE,
  // Legacy THINKING_* names are translated to REASONING_* by @ag-ui/client,
  // but some adapters still emit the old strings verbatim.
  "THINKING_START",
  "THINKING_END",
  "THINKING_TEXT_MESSAGE_START",
  "THINKING_TEXT_MESSAGE_CONTENT",
  "THINKING_TEXT_MESSAGE_END",
]);

type EventRecord = BaseEvent & Record<string, unknown>;

/** True for any event that would make CopilotKit render a reasoning bubble. */
export function isStudentReasoningEvent(event: BaseEvent): boolean {
  const record = event as EventRecord;
  const type = typeof record.type === "string" ? record.type : "";
  if (REASONING_EVENT_TYPES.has(type)) return true;
  if (record.role === "reasoning") return true;
  return false;
}

/**
 * Snapshots replay whole message histories. Remove reasoning messages there so
 * a restored thread cannot resurrect a bubble after a page reload.
 */
export function stripReasoningMessages(event: BaseEvent): BaseEvent {
  const record = event as EventRecord;
  if (record.type !== EventType.MESSAGES_SNAPSHOT && record.type !== EventType.STATE_SNAPSHOT) return event;
  if (!Array.isArray(record.messages)) return event;
  const messages = (record.messages as Array<{ role?: unknown }>).filter((message) => {
    const role = message && typeof message === "object" ? (message as { role?: unknown }).role : undefined;
    return role !== "reasoning";
  });
  return { ...record, messages } as BaseEvent;
}

/** Drop reasoning events and reasoning messages from the student's stream. */
export function filterStudentFacingEvents(events: Observable<BaseEvent>): Observable<BaseEvent> {
  return events.pipe(
    filter((event) => !isStudentReasoningEvent(event)),
    map((event) => stripReasoningMessages(event)),
  );
}

/** LangGraph agent whose AG-UI stream never contains student-visible reasoning. */
export class StudentSafeLangGraphAgent extends LangGraphAgent {
  override run(input: Parameters<LangGraphAgent["run"]>[0]): ReturnType<LangGraphAgent["run"]> {
    return filterStudentFacingEvents(super.run(input));
  }
}
