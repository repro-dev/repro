import { Col } from "@jsxstyle/react";
import { ToolCallPair } from "@repro/agentic";
import { color, radius, spacing } from "@repro/design";
import React from "react";
import { ToolCallRow } from "./ToolCallRow";

interface ToolCallGroupProps {
  pairs: Array<ToolCallPair>;
  isExecuting: boolean;
  wasCancelled: boolean;
  onGoToTime?: (timeMs: number) => void;
}

export const ToolCallGroup: React.FC<ToolCallGroupProps> = ({
  pairs,
  isExecuting,
  wasCancelled,
  onGoToTime,
}) => {
  return (
    <Col
      backgroundColor={color.bg.subtle}
      borderColor={color.border.default}
      borderStyle="solid"
      borderWidth={1}
      borderRadius={radius.md}
      padding={spacing.sm}
      gap={spacing.xs}
    >
      {pairs.map((pair) => (
        <ToolCallRow
          key={pair.toolCall.id}
          toolName={pair.toolCall.function.name}
          result={pair.result}
          isExecuting={isExecuting}
          wasCancelled={wasCancelled}
          onGoToTime={onGoToTime}
        />
      ))}
    </Col>
  );
};
