import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AssistantMessage, Entry, ToolMessage, UserMessage } from "../types";
import {
  AssistantMessageItem,
  ToolCallGroupItem,
  UserMessageItem,
  groupToolCalls,
} from "./groupToolCalls";

function makeUser(id: string, content: string): UserMessage {
  return { id, timestamp: new Date(), role: "user", content };
}

function makeAssistant(
  id: string,
  content: string,
  toolCallIds: string[] = [],
): AssistantMessage {
  return {
    id,
    timestamp: new Date(),
    role: "assistant",
    content,
    toolCalls: toolCallIds.map((tcId, index) => ({
      id: tcId,
      index,
      function: { name: `tool_${tcId}`, arguments: "{}" },
    })),
  };
}

function makeTool(
  id: string,
  toolCallId: string,
  content: string,
): ToolMessage {
  return {
    id,
    timestamp: new Date(),
    role: "tool",
    content,
    tool_call_id: toolCallId,
  };
}

describe("groupToolCalls", () => {
  it("returns empty array for empty entries", () => {
    const result = groupToolCalls([]);
    assert.deepEqual(result, []);
  });

  it("passes through user messages as user-message items", () => {
    const entries: Array<Entry> = [makeUser("1", "hello")];
    const result = groupToolCalls(entries);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.type, "user-message");
    assert.equal((result[0] as UserMessageItem).entry.id, "1");
  });

  it("passes through assistant messages without tool calls as assistant-message items", () => {
    const entries: Array<Entry> = [makeAssistant("1", "hi")];
    const result = groupToolCalls(entries);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.type, "assistant-message");
    assert.equal((result[0] as AssistantMessageItem).entry.id, "1");
  });

  it("groups assistant tool calls with following tool messages", () => {
    const entries: Array<Entry> = [
      makeAssistant("a1", "", ["tc1"]),
      makeTool("t1", "tc1", '{"result": true}'),
    ];
    const result = groupToolCalls(entries);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.type, "tool-call-group");
    const group = result[0] as ToolCallGroupItem;
    assert.equal(group.pairs.length, 1);
    assert.equal(group.pairs[0]!.toolCall.id, "tc1");
    assert.equal(group.pairs[0]!.result?.id, "t1");
  });

  it("sets result to null when no matching tool message follows", () => {
    const entries: Array<Entry> = [makeAssistant("a1", "", ["tc1"])];
    const result = groupToolCalls(entries);
    assert.equal(result.length, 1);
    const group = result[0] as ToolCallGroupItem;
    assert.equal(group.pairs[0]!.result, null);
  });

  it("groups multiple tool calls from one assistant turn", () => {
    const entries: Array<Entry> = [
      makeAssistant("a1", "", ["tc1", "tc2"]),
      makeTool("t1", "tc1", "{}"),
      makeTool("t2", "tc2", "{}"),
    ];
    const result = groupToolCalls(entries);
    assert.equal(result.length, 1);
    const group = result[0] as ToolCallGroupItem;
    assert.equal(group.pairs.length, 2);
    assert.equal(group.pairs[0]!.toolCall.id, "tc1");
    assert.equal(group.pairs[1]!.toolCall.id, "tc2");
  });

  it("produces correct sequence: user → tool-group → assistant → user", () => {
    const entries: Array<Entry> = [
      makeUser("u1", "query"),
      makeAssistant("a1", "", ["tc1"]),
      makeTool("t1", "tc1", "{}"),
      makeAssistant("a2", "done", []),
    ];
    const result = groupToolCalls(entries);
    assert.equal(result.length, 3);
    assert.equal(result[0]!.type, "user-message");
    assert.equal(result[1]!.type, "tool-call-group");
    assert.equal(result[2]!.type, "assistant-message");
  });

  it("skips standalone tool messages not consumed by any assistant", () => {
    const entries: Array<Entry> = [makeTool("t1", "tc1", "{}")];
    const result = groupToolCalls(entries);
    assert.equal(result.length, 0);
  });

  it("handles system messages by skipping them", () => {
    const entries: Array<Entry> = [
      {
        id: "s1",
        timestamp: new Date(),
        role: "system",
        content: "system prompt",
      },
      makeUser("u1", "hello"),
    ];
    const result = groupToolCalls(entries);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.type, "user-message");
  });

  it("handles two separate tool-call turns", () => {
    const entries: Array<Entry> = [
      makeAssistant("a1", "", ["tc1"]),
      makeTool("t1", "tc1", "{}"),
      makeAssistant("a2", "", ["tc2"]),
      makeTool("t2", "tc2", "{}"),
    ];
    const result = groupToolCalls(entries);
    assert.equal(result.length, 2);
    assert.equal(result[0]!.type, "tool-call-group");
    assert.equal(result[1]!.type, "tool-call-group");
  });
});
