import { Block, Col, Row } from "@jsxstyle/react";
import {
  color,
  fontFamily,
  fontWeight,
  fontSize,
  spacing,
  textStyles,
} from "@repro/design";
import React from "react";
import { ToolResultRow } from "./ToolResultRow";
import { TOOL_RESULT_ROW_STYLES } from "./toolResultRowStyles";

interface NetworkRequest {
  timeMs: number;
  type: string;
  method?: string;
  url: string;
  status?: number;
  durationMs?: number;
  contentType?: string;
  errorBody?: string;
  requestBody?: string;
  responseTimeMs?: number;
  headers?: Record<string, string>;
}

interface NetworkRequestResult {
  requests: NetworkRequest[];
  hint?: string;
}

interface NetworkRequestResultViewProps {
  result: NetworkRequestResult;
  onGoToTime?: (timeMs: number) => void;
}

type BadgeContext = "neutral" | "info" | "success" | "warning" | "danger";

// Returns a semantic colour for HTTP status codes.
function statusToContext(status: number): BadgeContext {
  if (status >= 500) return "danger";
  if (status >= 400) return "warning";
  if (status >= 200 && status < 300) return "success";
  return "neutral";
}

// Truncate a URL for display. Long URLs are cut at 80 chars with an ellipsis.
function truncateUrl(url: string, maxLen = 80): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 1) + "…";
}

export const NetworkRequestResultView: React.FC<
  NetworkRequestResultViewProps
> = ({ result, onGoToTime }) => {
  const { requests, hint } = result;

  if (requests.length === 0) {
    return (
      <Col gap={spacing.xs} padding={spacing.sm}>
        <Block {...textStyles.caption} color={color.text.muted}>
          No network requests
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
      {requests.map((req, i) => (
        <ToolResultRow
          key={i}
          timeMs={req.timeMs}
          alignItems="center"
          kind="network"
          onGoToTime={onGoToTime}
        >
          <Row
            minWidth={0}
            flexGrow={1}
            alignItems="center"
            gap={TOOL_RESULT_ROW_STYLES.gap}
          >
            <Block
              flexShrink={0}
              fontSize={fontSize.xs}
              fontFamily={fontFamily.mono}
              color={color.text.secondary}
              fontWeight={fontWeight.semibold}
              whiteSpace="nowrap"
              lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
            >
              {req.type === "fetch" && req.method != null
                ? req.method.toUpperCase()
                : req.type === "ws"
                ? "WS"
                : req.type}
            </Block>

            {req.status != null && (
              <Block flexShrink={0}>
                <Block
                  component="span"
                  fontSize={fontSize.xs}
                  fontFamily={fontFamily.mono}
                  color={
                    statusToContext(req.status) === "danger"
                      ? color.danger
                      : statusToContext(req.status) === "warning"
                      ? color.warning
                      : statusToContext(req.status) === "success"
                      ? color.success
                      : color.text.muted
                  }
                >
                  {req.status}
                </Block>
              </Block>
            )}

            <Block
              minWidth={0}
              fontSize={fontSize.xs}
              fontFamily={fontFamily.mono}
              color={color.text.secondary}
              flexGrow={1}
              overflow="hidden"
              whiteSpace="nowrap"
              textOverflow="ellipsis"
              lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
            >
              {truncateUrl(req.url)}
            </Block>

            {req.durationMs != null && (
              <Block
                flexShrink={0}
                fontSize={fontSize.xs}
                fontFamily={fontFamily.mono}
                color={color.text.muted}
                whiteSpace="nowrap"
              >
                {req.durationMs}ms
              </Block>
            )}
          </Row>
        </ToolResultRow>
      ))}
    </Col>
  );
};
