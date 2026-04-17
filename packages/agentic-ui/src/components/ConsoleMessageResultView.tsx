import { Block, Col, Grid } from "@jsxstyle/react";
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

function getConsoleLine1Tracks(
  hasCount: boolean,
  hasStackReference: boolean,
): string {
  const tracks = ["auto", "auto"];

  if (hasCount) {
    tracks.push("auto");
  }

  if (hasStackReference) {
    tracks.push("minmax(0, 1fr)");
  }

  return tracks.join(" ");
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
          alignItems="flex-start"
          kind="console"
          onGoToTime={onGoToTime}
        >
          {(() => {
            const { icon, color: messageColor } = getLevelPresentation(
              msg.level,
            );
            const stackReference = msg.stack?.[0];
            const structuredMessage = parseStructuredMessage(msg.text);
            const hasCount = msg.count !== undefined && msg.count > 1;
            const line1Tracks = getConsoleLine1Tracks(
              hasCount,
              stackReference != null,
            );

            return (
              <Grid
                minWidth={0}
                width="100%"
                flexGrow={1}
                rowGap={TOOL_RESULT_ROW_STYLES.lineGap}
                gridTemplateColumns="minmax(0, 1fr)"
              >
                <Grid
                  id={`console-message-line-1-${i}`}
                  minWidth={0}
                  alignItems="center"
                  columnGap={TOOL_RESULT_ROW_STYLES.gap}
                  lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                  gridTemplateColumns={line1Tracks}
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

                  {stackReference && (
                    <Block
                      fontSize={fontSize.xs}
                      fontFamily={fontFamily.mono}
                      color={color.text.muted}
                      whiteSpace="nowrap"
                      lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                    >
                      {stackReference}
                    </Block>
                  )}
                </Grid>

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
              </Grid>
            );
          })()}
        </ToolResultRow>
      ))}
    </Col>
  );
};
