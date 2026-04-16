import { Block, Col } from "@jsxstyle/react";
import { Badge } from "@repro/design";
import {
  color,
  fontFamily,
  fontSize,
  spacing,
  textStyles,
} from "@repro/design";
import React from "react";
import { ToolResultRow } from "./ToolResultRow";

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

// Maps log level strings to Badge context values for semantic colour-coding.
type BadgeContext = "neutral" | "info" | "success" | "warning" | "danger";

function levelToContext(level: string): BadgeContext {
  switch (level) {
    case "error":
      return "danger";
    case "warning":
      return "warning";
    case "info":
      return "info";
    default:
      return "neutral";
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
          onGoToTime={onGoToTime}
        >
          <Block flexShrink={0} alignSelf="flex-start">
            <Badge context={levelToContext(msg.level)} size="small" rounded>
              {msg.level}
            </Badge>
          </Block>

          <Block
            minWidth={0}
            fontSize={fontSize.xs}
            fontFamily={fontFamily.mono}
            color={color.text.secondary}
            wordBreak="break-all"
            flexGrow={1}
          >
            {msg.text}
            {msg.count !== undefined && msg.count > 1 && (
              <Block
                component="span"
                color={color.text.muted}
                marginLeft={spacing.xs}
              >
                ×{msg.count}
              </Block>
            )}
          </Block>
        </ToolResultRow>
      ))}
    </Col>
  );
};
