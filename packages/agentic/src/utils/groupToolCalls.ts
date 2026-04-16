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
  const hiddenToolCallIds = new Set<string>();

  for (const entry of entries) {
    if (entry.role === "tool") {
      if (entry.hidden === true) {
        hiddenToolCallIds.add(entry.tool_call_id);
      } else {
        toolMessages.set(entry.tool_call_id, entry);
      }
    }
  }

  for (const entry of entries) {
    if (entry.role === "user") {
      if (truncatedBeforeId != null && entry.id === truncatedBeforeId) {
        result.push({ type: "truncation-indicator" });
      }
      result.push({ type: "user-message", entry });
    } else if (entry.role === "assistant") {
      // Emit text and tool calls independently — they are not mutually exclusive.
      // The truncation indicator always appears before the first item for this entry.
      const hasContent = entry.content.length > 0;
      const hasToolCalls = entry.toolCalls.length > 0;

      if (hasContent) {
        if (truncatedBeforeId != null && entry.id === truncatedBeforeId) {
          result.push({ type: "truncation-indicator" });
        }
        result.push({ type: "assistant-message", entry });
        if (hasToolCalls) {
          const pairs: Array<ToolCallPair> = entry.toolCalls
            .filter((toolCall) => !hiddenToolCallIds.has(toolCall.id))
            .map((toolCall) => {
              const toolResult = toolMessages.get(toolCall.id) ?? null;
              return { toolCall, result: toolResult };
            });
          if (pairs.length > 0) {
            result.push({ type: "tool-call-group", pairs });
          }
        }
      } else if (hasToolCalls) {
        if (truncatedBeforeId != null && entry.id === truncatedBeforeId) {
          result.push({ type: "truncation-indicator" });
        }
        const pairs: Array<ToolCallPair> = entry.toolCalls
          .filter((toolCall) => !hiddenToolCallIds.has(toolCall.id))
          .map((toolCall) => {
            const toolResult = toolMessages.get(toolCall.id) ?? null;
            return { toolCall, result: toolResult };
          });
        if (pairs.length > 0) {
          result.push({ type: "tool-call-group", pairs });
        }
      } else {
        // Fallback: empty content and no tool calls (loading/in-progress state).
        if (truncatedBeforeId != null && entry.id === truncatedBeforeId) {
          result.push({ type: "truncation-indicator" });
        }
        result.push({ type: "assistant-message", entry });
      }
    }
  }

  return result;
}
