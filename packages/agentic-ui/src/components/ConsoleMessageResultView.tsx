import { Block, Col, Row } from "@jsxstyle/react";
import { Badge } from "@repro/design";
import {
  color,
  fontFamily,
  fontSize,
  spacing,
  textStyles,
} from "@repro/design";
import React from "react";

interface ConsoleMessage {
  timeMs: number;
  level: string;
  text: string;
  stack?: string[];
  count?: number;
}

interface ConsoleMessageResult {
  messages: ConsoleMessage[];
}

interface ConsoleMessageResultViewProps {
  result: ConsoleMessageResult;
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

// Format a millisecond timestamp as HH:mm:ss.SSS for human readability.
function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return (
    [
      String(hours).padStart(2, "0"),
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0"),
    ].join(":") +
    "." +
    String(millis).padStart(3, "0")
  );
}

export const ConsoleMessageResultView: React.FC<
  ConsoleMessageResultViewProps
> = ({ result }) => {
  const { messages } = result;

  if (messages.length === 0) {
    return (
      <Block
        {...textStyles.caption}
        color={color.text.muted}
        padding={spacing.sm}
      >
        No console messages
      </Block>
    );
  }

  return (
    <Col>
      {messages.map((msg, i) => (
        <Row
          key={i}
          alignItems="flex-start"
          gap={spacing.sm}
          paddingV={spacing.xs}
          paddingH={spacing.sm}
          borderBottom={`1px solid ${color.border.default}`}
          flexWrap="wrap"
        >
          {/* Level badge — coloured by severity */}
          <Block flexShrink={0}>
            <Badge context={levelToContext(msg.level)} size="small" rounded>
              {msg.level}
            </Badge>
          </Block>

          {/* Timestamp */}
          <Block
            fontSize={fontSize.xs}
            fontFamily={fontFamily.mono}
            color={color.text.muted}
            flexShrink={0}
            whiteSpace="nowrap"
          >
            {formatTimeMs(msg.timeMs)}
          </Block>

          {/* Message text */}
          <Block
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
        </Row>
      ))}
    </Col>
  );
};
