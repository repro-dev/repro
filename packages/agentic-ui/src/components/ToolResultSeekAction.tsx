import { Block, Row } from "@jsxstyle/react";
import {
  color,
  focusRing,
  lineHeight,
  radius,
  transition,
} from "@repro/design";
import { SkipForward } from "lucide-react";
import React, { useCallback } from "react";
import { TOOL_RESULT_ROW_STYLES } from "./toolResultRowStyles";

interface ToolResultSeekActionProps {
  timeMs: number;
  onGoToTime?: (timeMs: number) => void;
}

export const ToolResultSeekAction: React.FC<ToolResultSeekActionProps> = ({
  timeMs,
  onGoToTime,
}) => {
  const handleClick = useCallback<React.MouseEventHandler<HTMLButtonElement>>(
    (event) => {
      event.currentTarget.blur();
      onGoToTime?.(timeMs);
    },
    [onGoToTime, timeMs],
  );

  return (
    <Row
      component="button"
      alignItems="center"
      gap={TOOL_RESULT_ROW_STYLES.actionGap}
      padding={TOOL_RESULT_ROW_STYLES.actionPadding}
      appearance="none"
      border="none"
      whiteSpace="nowrap"
      lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
      color={color.text.inverse}
      backgroundColor={color.primary}
      borderRadius={radius.sm}
      opacity={TOOL_RESULT_ROW_STYLES.actionOpacityHidden}
      hoverOpacity={TOOL_RESULT_ROW_STYLES.actionOpacityVisible}
      focusOpacity={TOOL_RESULT_ROW_STYLES.actionOpacityVisible}
      userSelect="none"
      cursor="pointer"
      hoverBackgroundColor={color.primary}
      hoverColor={color.text.inverse}
      focusBackgroundColor={color.primary}
      transition={transition.opacity}
      {...focusRing()}
      props={{
        type: "button",
        onClick: handleClick,
        "aria-label": "Go to time",
      }}
    >
      <SkipForward size={TOOL_RESULT_ROW_STYLES.actionIconSize} />
      <Block
        fontSize={TOOL_RESULT_ROW_STYLES.actionLabelFontSize}
        lineHeight={lineHeight.normal}
      >
        Go To Time
      </Block>
    </Row>
  );
};
