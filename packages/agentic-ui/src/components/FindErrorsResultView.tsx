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
        <ToolResultRow
          key={i}
          timeMs={err.time}
          alignItems="flex-start"
          showGoToTime={false}
        >
          <Block flexShrink={0} alignSelf="flex-start">
            <Badge context={sourceToContext(err.source)} size="small" rounded>
              {err.source}
            </Badge>
          </Block>

          <Block
            minWidth={0}
            fontSize={fontSize.xs}
            fontFamily={fontFamily.mono}
            color={color.text.secondary}
            flexGrow={1}
            wordBreak="break-all"
          >
            {err.summary}
          </Block>
        </ToolResultRow>
      ))}
    </Col>
  );
};
