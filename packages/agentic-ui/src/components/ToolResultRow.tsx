import { Block, Row } from "@jsxstyle/react";
import { color, fontFamily, fontSize, transition } from "@repro/design";
import React from "react";
import { formatTimeMs } from "./formatTimeMs";
import { ToolResultSeekAction } from "./ToolResultSeekAction";

interface ToolResultRowProps {
  timeMs: number;
  children: React.ReactNode;
  alignItems?: "center" | "flex-start";
  onGoToTime?: (timeMs: number) => void;
  showGoToTime?: boolean;
  kind?: "console" | "network";
}

export const ToolResultRow: React.FC<ToolResultRowProps> = ({
  timeMs,
  children,
  alignItems = "center",
  onGoToTime,
  showGoToTime = true,
  kind = "console",
}) => {
  const showAction = showGoToTime;
  const rowAlignItems = kind === "network" ? "center" : alignItems;
  const contentAlignItems = kind === "network" ? "center" : alignItems;

  return (
    <Row
      alignItems={rowAlignItems}
      gap={10}
      paddingBlock={kind === "network" ? 10 : 6}
      paddingInline={15}
      position="relative"
      fontSize={11}
      lineHeight={1.25}
      borderBottom={`1px solid ${color.border.default}`}
      hoverBackgroundColor={color.bg.hover}
      transition={transition.fast}
      cursor="default"
    >
      <Block
        flexShrink={0}
        minWidth={72}
        position="relative"
        fontSize={fontSize.xs}
        fontFamily={fontFamily.mono}
        color={color.text.muted}
        whiteSpace="nowrap"
        lineHeight={1.25}
      >
        {formatTimeMs(timeMs)}

        {showAction && (
          <Block
            position="absolute"
            top={kind === "network" ? "50%" : -3}
            left={kind === "network" ? 5 : -10}
            transform={kind === "network" ? "translateY(-50%)" : undefined}
          >
            <ToolResultSeekAction timeMs={timeMs} onGoToTime={onGoToTime} />
          </Block>
        )}
      </Block>

      <Row
        flexGrow={1}
        minWidth={0}
        alignItems={contentAlignItems}
        gap={10}
        flexWrap={kind === "console" ? "wrap" : "nowrap"}
      >
        {children}
      </Row>
    </Row>
  );
};
