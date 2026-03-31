import {
  AssistantMessage,
  Entry,
  ToolCall,
  ToolMessage,
  UserMessage,
} from "../types";

export interface UserMessageItem {
  type: "user-message";
  entry: UserMessage;
}

export interface AssistantMessageItem {
  type: "assistant-message";
  entry: AssistantMessage;
}

export interface ToolCallPair {
  toolCall: ToolCall;
  result: ToolMessage | null;
}

export interface ToolCallGroupItem {
  type: "tool-call-group";
  pairs: Array<ToolCallPair>;
}

export interface TruncationIndicatorItem {
  type: "truncation-indicator";
}

export type RenderItem =
  | UserMessageItem
  | AssistantMessageItem
  | ToolCallGroupItem
  | TruncationIndicatorItem;

export function groupToolCalls(
  entries: Array<Entry>,
  truncatedBeforeId?: string | null,
): Array<RenderItem> {
  const result: Array<RenderItem> = [];
  const toolMessages = new Map<string, ToolMessage>();

  for (const entry of entries) {
    if (entry.role === "tool") {
      toolMessages.set(entry.tool_call_id, entry);
    }
  }

  for (const entry of entries) {
    if (entry.role === "user") {
      if (truncatedBeforeId != null && entry.id === truncatedBeforeId) {
        result.push({ type: "truncation-indicator" });
      }
      result.push({ type: "user-message", entry });
    } else if (entry.role === "assistant") {
      if (entry.toolCalls.length > 0) {
        if (truncatedBeforeId != null && entry.id === truncatedBeforeId) {
          result.push({ type: "truncation-indicator" });
        }
        const pairs: Array<ToolCallPair> = entry.toolCalls.map((toolCall) => {
          const toolResult = toolMessages.get(toolCall.id) ?? null;
          return { toolCall, result: toolResult };
        });
        result.push({ type: "tool-call-group", pairs });
      } else {
        if (truncatedBeforeId != null && entry.id === truncatedBeforeId) {
          result.push({ type: "truncation-indicator" });
        }
        result.push({ type: "assistant-message", entry });
      }
    }
  }

  return result;
}
