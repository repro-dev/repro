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
import { ToolResultSemanticGrid } from "./ToolResultSemanticGrid";
import { TOOL_RESULT_ROW_STYLES } from "./toolResultRowStyles";
import { JSONView } from "../../../devtools/src/JSONView";

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

function parseStructuredMessage(text: string): unknown | null {
  try {
    return JSON.parse(text.trim()) as unknown;
  } catch {
    return null;
  }
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
        <ToolResultSemanticGrid
          key={i}
          timeMs={msg.timeMs}
          kind="console"
          onGoToTime={onGoToTime}
          gridTemplateColumns="auto auto 1fr"
        >
          {(() => {
            const { icon, color: messageColor } = getLevelPresentation(
              msg.level,
            );
            const stackReference = msg.stack?.[0];
            const structuredMessage = parseStructuredMessage(msg.text);
            const hasCount = msg.count !== undefined && msg.count > 1;

            return (
              <>
                <Block
                  id={`console-message-line-1-${i}`}
                  minWidth={0}
                  gridColumn="1 / span 2"
                  paddingLeft={TOOL_RESULT_ROW_STYLES.consoleContentShift}
                >
                  <Row
                    alignItems="center"
                    gap={TOOL_RESULT_ROW_STYLES.consoleHeaderGap}
                    lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                  >
                    <Block color={messageColor} lineHeight={1}>
                      {icon}
                    </Block>

                    <Block
                      fontSize={fontSize.xs}
                      fontFamily={fontFamily.mono}
                      color={messageColor}
                      fontWeight={fontWeight.semibold}
                      textTransform="uppercase"
                      lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                    >
                      {msg.level}
                    </Block>

                    {hasCount && (
                      <Block
                        color={color.text.muted}
                        fontSize={fontSize.xs}
                        fontFamily={fontFamily.mono}
                        lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                      >
                        ×{msg.count}
                      </Block>
                    )}
                  </Row>
                </Block>

                {stackReference && (
                  <Row width="100%" justifyContent="flex-end">
                    <Block
                      fontSize={fontSize.xs}
                      fontFamily={fontFamily.mono}
                      color={color.text.muted}
                      whiteSpace="nowrap"
                      lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                    >
                      {stackReference}
                    </Block>
                  </Row>
                )}

                <Block
                  id={`console-message-line-2-${i}`}
                  minWidth={0}
                  gridColumn="1 / -1"
                  width="100%"
                  fontSize={fontSize.xs}
                  fontFamily={fontFamily.mono}
                  color={messageColor}
                  wordBreak="break-word"
                  lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                  whiteSpace="pre-wrap"
                >
                  {structuredMessage !== null ? (
                    <JSONView data={structuredMessage} />
                  ) : (
                    msg.text
                  )}
                </Block>
              </>
            );
          })()}
        </ToolResultSemanticGrid>
      ))}
    </Col>
  );
};
