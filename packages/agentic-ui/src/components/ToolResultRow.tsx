import { Block, Row } from "@jsxstyle/react";
import {
  color,
  focusRing,
  fontFamily,
  fontSize,
  radius,
  spacing,
  transition,
} from "@repro/design";
import React, { useState } from "react";
import { formatTimeMs } from "./formatTimeMs";

interface ToolResultRowProps {
  timeMs: number;
  children: React.ReactNode;
  alignItems?: "center" | "flex-start";
  onGoToTime?: (timeMs: number) => void;
  showGoToTime?: boolean;
}

export const ToolResultRow: React.FC<ToolResultRowProps> = ({
  timeMs,
  children,
  alignItems = "center",
  onGoToTime,
  showGoToTime = true,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Row
      alignItems={alignItems}
      gap={spacing.sm}
      paddingBlock={spacing.xs}
      paddingInline={spacing.sm}
      paddingInlineEnd={showGoToTime ? spacing["3xl"] : spacing.sm}
      position="relative"
      borderBottom={`1px solid ${color.border.default}`}
      hoverBackgroundColor={color.bg.hover}
      transition={transition.fast}
      props={{
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      }}
    >
      <Block
        flexShrink={0}
        fontSize={fontSize.xs}
        fontFamily={fontFamily.mono}
        color={color.text.muted}
        whiteSpace="nowrap"
      >
        {formatTimeMs(timeMs)}
      </Block>

      <Row flexGrow={1} minWidth={0} alignItems={alignItems} gap={spacing.sm}>
        {children}
      </Row>

      {showGoToTime && (
        <Block
          component="button"
          position="absolute"
          right={spacing.sm}
          top="50%"
          transform="translateY(-50%)"
          opacity={isHovered ? 1 : 0}
          pointerEvents={isHovered ? "auto" : "none"}
          paddingBlock={spacing.xs}
          paddingInline={spacing.sm}
          borderStyle="solid"
          borderWidth={1}
          borderColor={color.border.default}
          borderRadius={radius.sm}
          backgroundColor={color.bg.surface}
          color={color.text.secondary}
          cursor="pointer"
          fontSize={fontSize.xs}
          fontFamily={fontFamily.sans}
          transition={transition.fast}
          hoverBackgroundColor={color.bg.hover}
          hoverColor={color.text.default}
          {...focusRing("neutral")}
          props={{
            type: "button",
            onClick: () => onGoToTime?.(timeMs),
            "aria-label": "Go to time >",
          }}
        >
          Go to time &gt;
        </Block>
      )}
    </Row>
  );
};
