import { Block, Col } from "@jsxstyle/react";
import { Md } from "@m2d/react-markdown";
import { AgenticError, Entry, Loading, groupToolCalls } from "@repro/agentic";
import { colors, spacing } from "@repro/design";
import React, { useMemo } from "react";
import { INPUT_CONTAINER_OFFSET_PX } from "../constants";
import { EmptyState } from "../EmptyState";
import { ErrorMessage } from "./ErrorMessage";
import { ResponseFeedback } from "./ResponseFeedback";
import { ToolCallGroup } from "./ToolCallGroup";

interface MessageListProps {
  entries: Array<Entry>;
  loading: Loading;
  error: AgenticError | null;
  onRetry: () => void;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  contentContainerRef: React.RefObject<HTMLDivElement>;
  onSelectPrompt: (prompt: string) => void;
  wasCancelled: boolean;
  onFeedback?: (sentiment: "positive" | "negative") => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  entries,
  loading,
  error,
  onRetry,
  scrollContainerRef,
  contentContainerRef,
  onSelectPrompt,
  wasCancelled,
  onFeedback,
}) => {
  const renderItems = useMemo(() => groupToolCalls(entries), [entries]);

  return (
    <Block
      blockSize={
        loading === "none"
          ? `calc(100cqb - ${INPUT_CONTAINER_OFFSET_PX}px)`
          : "100cqb"
      }
      fontSize={13}
      overflowY="scroll"
      paddingBlock={spacing.lg}
      paddingInline={spacing["2xl"]}
      transition="block-size 250ms ease-in-out"
      props={{ ref: scrollContainerRef }}
    >
      <Col gap={10} minBlockSize="100%" props={{ ref: contentContainerRef }}>
        {entries.length === 0 && <EmptyState onSelectPrompt={onSelectPrompt} />}

        {renderItems.map((item) => {
          if (item.type === "user-message") {
            return (
              <Col key={item.entry.id} lineHeight={1.5}>
                <Block
                  marginInlineStart={spacing["3xl"]}
                  paddingInline={spacing.lg}
                  backgroundColor={colors.blue["50"]}
                  borderColor={colors.blue["100"]}
                  borderStyle="solid"
                  borderWidth={0}
                  borderBlockEndWidth={3}
                  borderRadius={8}
                >
                  <Md>{item.entry.content}</Md>
                </Block>
              </Col>
            );
          }

          if (item.type === "assistant-message") {
            return (
              <Col key={item.entry.id} lineHeight={1.5}>
                <Block>
                  <Md>{item.entry.content}</Md>
                </Block>
                {item.entry.content.length > 0 &&
                  loading === "none" &&
                  onFeedback != null && (
                    <ResponseFeedback onFeedback={onFeedback} />
                  )}
              </Col>
            );
          }

          return (
            <ToolCallGroup
              key={`tool-group-${item.pairs[0]?.toolCall.id}`}
              pairs={item.pairs}
              isExecuting={loading === "tool-executing"}
              wasCancelled={wasCancelled}
            />
          );
        })}

        {error !== null && (
          <ErrorMessage error={error} onRetry={onRetry} />
        )}
      </Col>
    </Block>
  );
};
