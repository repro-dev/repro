import { Block, Row } from "@jsxstyle/react";
import { color, fontFamily, transition } from "@repro/design";
import React from "react";
import { formatTimeMs } from "./formatTimeMs";
import { ToolResultSeekAction } from "./ToolResultSeekAction";
import { TOOL_RESULT_ROW_STYLES } from "./toolResultRowStyles";

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
      gap={TOOL_RESULT_ROW_STYLES.gap}
      paddingBlock={
        kind === "network"
          ? TOOL_RESULT_ROW_STYLES.paddingBlockNetwork
          : TOOL_RESULT_ROW_STYLES.paddingBlockConsole
      }
      paddingInline={TOOL_RESULT_ROW_STYLES.paddingInline}
      position="relative"
      fontSize={TOOL_RESULT_ROW_STYLES.rowFontSize}
      lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
      borderBottomWidth={TOOL_RESULT_ROW_STYLES.borderWidth}
      borderBottomStyle="solid"
      borderBottomColor={color.border.default}
      hoverBackgroundColor={color.bg.hover}
      transition={transition.fast}
      cursor="default"
    >
      <Block
        flexShrink={0}
        minWidth={TOOL_RESULT_ROW_STYLES.timeColumnMinWidth}
        position="relative"
        fontSize={TOOL_RESULT_ROW_STYLES.rowFontSize}
        fontFamily={fontFamily.mono}
        color={color.text.muted}
        whiteSpace="nowrap"
        lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
      >
        {formatTimeMs(timeMs)}

        {showAction && (
          <Block
            position="absolute"
            top={TOOL_RESULT_ROW_STYLES.timeActionConsoleTop}
            left={TOOL_RESULT_ROW_STYLES.timeActionConsoleLeft}
          >
            <ToolResultSeekAction timeMs={timeMs} onGoToTime={onGoToTime} />
          </Block>
        )}
      </Block>

      <Row
        flexGrow={1}
        minWidth={0}
        alignItems={contentAlignItems}
        gap={TOOL_RESULT_ROW_STYLES.gap}
        flexWrap={kind === "console" ? "wrap" : "nowrap"}
      >
        {children}
      </Row>
    </Row>
  );
};
