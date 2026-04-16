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

interface ErrorEntry {
  time: number;
  source: "console" | "network";
  summary: string;
  stack?: string[];
}

interface FindErrorsResult {
  errors: ErrorEntry[];
}

interface FindErrorsResultViewProps {
  result: FindErrorsResult;
}

// Maps error source to Badge context for semantic colour.
type BadgeContext = "neutral" | "info" | "success" | "warning" | "danger";

function sourceToContext(source: string): BadgeContext {
  switch (source) {
    case "console":
      return "danger";
    case "network":
      return "warning";
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

export const FindErrorsResultView: React.FC<FindErrorsResultViewProps> = ({
  result,
}) => {
  const { errors } = result;

  if (errors.length === 0) {
    return (
      <Block
        {...textStyles.caption}
        color={color.text.muted}
        padding={spacing.sm}
      >
        No errors found
      </Block>
    );
  }

  return (
    <Col>
      {errors.map((err, i) => (
        <Row
          key={i}
          alignItems="flex-start"
          gap={spacing.sm}
          paddingV={spacing.xs}
          paddingH={spacing.sm}
          borderBottom={`1px solid ${color.border.default}`}
          flexWrap="wrap"
        >
          {/* Source badge — console (danger) or network (warning) */}
          <Block flexShrink={0}>
            <Badge context={sourceToContext(err.source)} size="small" rounded>
              {err.source}
            </Badge>
          </Block>

          {/* Error summary text */}
          <Block
            fontSize={fontSize.xs}
            fontFamily={fontFamily.mono}
            color={color.text.secondary}
            flexGrow={1}
            wordBreak="break-all"
          >
            {err.summary}
          </Block>

          {/* Timestamp */}
          <Block
            fontSize={fontSize.xs}
            fontFamily={fontFamily.mono}
            color={color.text.muted}
            flexShrink={0}
            whiteSpace="nowrap"
          >
            {formatTimeMs(err.time)}
          </Block>
        </Row>
      ))}
    </Col>
  );
};
