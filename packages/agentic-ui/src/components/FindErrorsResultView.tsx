import { Block, Col, Grid, Row } from "@jsxstyle/react";
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

function sourceToPresentation(source: string): {
  icon: React.ReactNode;
  color: string;
} {
  switch (source) {
    case "console":
      return {
        icon: <AlertTriangle size={14} color={color.danger} />,
        color: color.danger,
      };
    case "network":
      return {
        icon: <AlertCircle size={14} color={color.warning} />,
        color: color.warning,
      };
    default:
      return {
        icon: <AlertCircle size={14} color={color.text.muted} />,
        color: color.text.muted,
      };
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
          kind="console"
          showGoToTime={false}
        >
          {(() => {
            const { icon, color: entryColor } = sourceToPresentation(
              err.source,
            );
            const stackReference = err.stack?.[0];

            return (
              <Grid
                minWidth={0}
                width="100%"
                flexGrow={1}
                rowGap={TOOL_RESULT_ROW_STYLES.lineGap}
                gridTemplateColumns="auto auto 1fr"
                columnGap={TOOL_RESULT_ROW_STYLES.gap}
              >
                <Block
                  id={`find-errors-line-1-${i}`}
                  minWidth={0}
                  gridColumn="1 / span 2"
                >
                  <Row
                    alignItems="center"
                    gap={TOOL_RESULT_ROW_STYLES.gap}
                    lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                  >
                    <Block color={entryColor} lineHeight={1}>
                      {icon}
                    </Block>

                    <Block
                      fontSize={fontSize.xs}
                      fontFamily={fontFamily.mono}
                      color={entryColor}
                      fontWeight={fontWeight.semibold}
                      textTransform="uppercase"
                      lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                    >
                      {err.source}
                    </Block>
                  </Row>
                </Block>

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

                <Block
                  id={`find-errors-line-2-${i}`}
                  minWidth={0}
                  gridColumn="1 / -1"
                  width="100%"
                  fontSize={fontSize.xs}
                  fontFamily={fontFamily.mono}
                  color={entryColor}
                  flexGrow={1}
                  wordBreak="break-word"
                  lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
                >
                  {err.summary}
                </Block>
              </Grid>
            );
          })()}
        </ToolResultRow>
      ))}
    </Col>
  );
};
