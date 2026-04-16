import { Block, Col, Row } from "@jsxstyle/react";
import {
  color,
  fontFamily,
  fontWeight,
  fontSize,
  spacing,
  textStyles,
} from "@repro/design";
import { AlertCircle, AlertTriangle } from "lucide-react";
import React from "react";
import { ToolResultRow } from "./ToolResultRow";
import { TOOL_RESULT_ROW_STYLES } from "./toolResultRowStyles";

interface ConsoleMessage {
  timeMs: number;
  level: string;
  text: string;
  stack?: string[];
  count?: number;
}

interface ConsoleMessageResult {
  messages: ConsoleMessage[];
  hint?: string;
}

interface ConsoleMessageResultViewProps {
  result: ConsoleMessageResult;
  onGoToTime?: (timeMs: number) => void;
}

function getLevelPresentation(level: string): {
  icon: React.ReactNode;
  color: string;
} {
  switch (level) {
    case "error":
      return {
        icon: <AlertTriangle size={14} color={color.danger} />,
        color: color.danger,
      };
    case "warning":
      return {
        icon: <AlertTriangle size={14} color={color.warning} />,
        color: color.warning,
      };
    case "info":
      return {
        icon: <AlertCircle size={14} color={color.info} />,
        color: color.info,
      };
    default:
      return {
        icon: <AlertCircle size={14} color={color.text.muted} />,
        color: color.text.muted,
      };
  }
}

export const ConsoleMessageResultView: React.FC<
  ConsoleMessageResultViewProps
> = ({ result, onGoToTime }) => {
  const { messages, hint } = result;

  if (messages.length === 0) {
    return (
      <Col gap={spacing.xs} padding={spacing.sm}>
        <Block {...textStyles.caption} color={color.text.muted}>
          No console messages
        </Block>
        {hint && (
          <Block {...textStyles.caption} color={color.text.secondary}>
            Hint: {hint}
          </Block>
        )}
      </Col>
    );
  }

  return (
    <Col>
      {messages.map((msg, i) => (
        <ToolResultRow
          key={i}
          timeMs={msg.timeMs}
          alignItems="center"
          kind="console"
          onGoToTime={onGoToTime}
        >
          {(() => {
            const { icon, color: messageColor } = getLevelPresentation(
              msg.level,
            );
            const stackReference = msg.stack?.[0];

            return (
              <Row
                minWidth={0}
                flexGrow={1}
                alignItems="center"
                lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                gap={TOOL_RESULT_ROW_STYLES.gap}
              >
                <Block flexShrink={0} color={messageColor} lineHeight={1}>
                  {icon}
                </Block>

                <Block
                  minWidth={0}
                  fontSize={fontSize.xs}
                  fontFamily={fontFamily.mono}
                  color={messageColor}
                  wordBreak="break-word"
                  lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                  flexGrow={1}
                >
                  {msg.text}
                  {msg.count !== undefined && msg.count > 1 && (
                    <Block
                      component="span"
                      color={color.text.muted}
                      marginLeft={TOOL_RESULT_ROW_STYLES.actionLabelSpacing}
                      fontWeight={fontWeight.semibold}
                    >
                      ×{msg.count}
                    </Block>
                  )}
                </Block>

                {stackReference && (
                  <Block
                    flexShrink={0}
                    fontSize={fontSize.xs}
                    fontFamily={fontFamily.mono}
                    color={color.text.muted}
                    whiteSpace="nowrap"
                  >
                    {stackReference}
                  </Block>
                )}
              </Row>
            );
          })()}
        </ToolResultRow>
      ))}
    </Col>
  );
};
