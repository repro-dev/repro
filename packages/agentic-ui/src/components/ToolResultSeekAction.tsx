import { Block, Row } from "@jsxstyle/react";
import { color, radius } from "@repro/design";
import { SkipForward } from "lucide-react";
import React from "react";

interface ToolResultSeekActionProps {
  timeMs: number;
  onGoToTime?: (timeMs: number) => void;
}

export const ToolResultSeekAction: React.FC<ToolResultSeekActionProps> = ({
  timeMs,
  onGoToTime,
}) => (
  <Row
    component="button"
    alignItems="center"
    gap={5}
    padding={5}
    whiteSpace="nowrap"
    lineHeight={1.25}
    color={color.text.inverse}
    backgroundColor={color.primary}
    borderRadius={radius.sm}
    opacity={0}
    hoverOpacity={1}
    userSelect="none"
    cursor="pointer"
    hoverBackgroundColor={color.primary}
    hoverColor={color.text.inverse}
    focusBackgroundColor={color.primary}
    props={{
      type: "button",
      onClick: () => onGoToTime?.(timeMs),
      "aria-label": "Go to time",
    }}
  >
    <SkipForward size={13} />
    <Block fontSize={11}>Go to time</Block>
  </Row>
);
