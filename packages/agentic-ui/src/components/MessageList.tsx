import { Block, Col } from "@jsxstyle/react";
import { Md } from "@m2d/react-markdown";
import { Entry, Loading, groupToolCalls } from "@repro/agentic";
import { colors } from "@repro/design";
import React, { useMemo } from "react";
import { INPUT_CONTAINER_OFFSET_PX } from "../constants";
import { EmptyState } from "../EmptyState";
import { ToolCallGroup } from "./ToolCallGroup";

interface MessageListProps {
  entries: Array<Entry>;
  loading: Loading;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  contentContainerRef: React.RefObject<HTMLDivElement>;
}

export const MessageList: React.FC<MessageListProps> = ({
  entries,
  loading,
  scrollContainerRef,
  contentContainerRef,
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
      marginBlockEnd={20}
      overflowY="scroll"
      paddingInline={20}
      paddingBlock={10}
      transition="block-size 250ms ease-in-out"
      props={{ ref: scrollContainerRef }}
    >
      <Col gap={10} minBlockSize="100%" props={{ ref: contentContainerRef }}>
        {entries.length === 0 && <EmptyState />}

        {renderItems.map((item) => {
          if (item.type === "user-message") {
            return (
              <Col key={item.entry.id} lineHeight={1.5}>
                <Block
                  marginInlineStart={30}
                  paddingInline={10}
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
              </Col>
            );
          }

          return (
            <ToolCallGroup
              key={`tool-group-${item.pairs[0]?.toolCall.id}`}
              pairs={item.pairs}
              isExecuting={loading === "tool-executing"}
            />
          );
        })}
      </Col>
    </Block>
  );
};
