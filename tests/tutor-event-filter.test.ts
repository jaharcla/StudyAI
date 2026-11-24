import { describe, expect, it } from "vitest";
import { EventType, type BaseEvent } from "@ag-ui/client";
import { of, toArray, firstValueFrom } from "rxjs";
import { filterStudentFacingEvents, isStudentReasoningEvent, stripReasoningMessages } from "../server/tutor-event-filter";

const reasoningStart = { type: EventType.REASONING_MESSAGE_START, messageId: "thought-1", role: "reasoning" } as unknown as BaseEvent;
const reasoningContent = { type: EventType.REASONING_MESSAGE_CONTENT, messageId: "thought-1", delta: "Need search docs" } as unknown as BaseEvent;
const legacyThinking = { type: "THINKING_TEXT_MESSAGE_CONTENT", delta: "private" } as unknown as BaseEvent;

describe("Tutor student event filter", () => {
  it("classifies reasoning events but keeps answer events", () => {
    expect(isStudentReasoningEvent(reasoningStart)).toBe(true);
    expect(isStudentReasoningEvent(reasoningContent)).toBe(true);
    expect(isStudentReasoningEvent(legacyThinking)).toBe(true);
    expect(isStudentReasoningEvent({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: "a", delta: "The answer" } as BaseEvent)).toBe(false);
  });

  it("filters streaming reasoning and legacy thinking without dropping the answer", async () => {
    const answerStart = { type: EventType.TEXT_MESSAGE_START, messageId: "a", role: "assistant" } as unknown as BaseEvent;
    const answerText = { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "a", delta: "4" } as unknown as BaseEvent;
    const emitted = await firstValueFrom(filterStudentFacingEvents(of(reasoningStart, reasoningContent, legacyThinking, answerStart, answerText)).pipe(toArray()));
    expect(emitted).toEqual([answerStart, answerText]);
  });

  it("strips reasoning messages from replayed snapshots", () => {
    const snapshot = {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: "u", role: "user", content: "question" },
        { id: "thought-1", role: "reasoning", content: "private thinking" },
        { id: "a", role: "assistant", content: "answer" },
      ],
    } as unknown as BaseEvent;
    const cleaned = stripReasoningMessages(snapshot);
    expect((cleaned as unknown as { messages: Array<{ role: string }> }).messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect((snapshot as unknown as { messages: unknown[] }).messages).toHaveLength(3);
  });
});
