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
}

// Maps HTTP method strings to Badge context values.
type BadgeContext = "neutral" | "info" | "success" | "warning" | "danger";

function methodToContext(method: string): BadgeContext {
  switch (method.toUpperCase()) {
    case "GET":
      return "info";
    case "POST":
      return "success";
    case "PUT":
    case "PATCH":
      return "warning";
    case "DELETE":
      return "danger";
    default:
      return "neutral";
  }
}

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
> = ({ result }) => {
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
        <Row
          key={i}
          alignItems="center"
          gap={spacing.sm}
          paddingV={spacing.xs}
          paddingH={spacing.sm}
          borderBottom={`1px solid ${color.border.default}`}
          flexWrap="wrap"
        >
          {/* HTTP method badge (only for fetch requests) */}
          {req.type === "fetch" && req.method != null && (
            <Block flexShrink={0}>
              <Badge context={methodToContext(req.method)} size="small" rounded>
                {req.method.toUpperCase()}
              </Badge>
            </Block>
          )}

          {/* WebSocket indicator */}
          {req.type === "ws" && (
            <Block flexShrink={0}>
              <Badge context="neutral" size="small" rounded>
                WS
              </Badge>
            </Block>
          )}

          {/* Status code — colour-coded by range */}
          {req.status != null && (
            <Block flexShrink={0}>
              <Badge context={statusToContext(req.status)} size="small">
                {req.status}
              </Badge>
            </Block>
          )}

          {/* URL — truncated for long paths */}
          <Block
            fontSize={fontSize.xs}
            fontFamily={fontFamily.mono}
            color={color.text.secondary}
            flexGrow={1}
            wordBreak="break-all"
          >
            {truncateUrl(req.url)}
          </Block>

          {/* Duration */}
          {req.durationMs != null && (
            <Block
              fontSize={fontSize.xs}
              fontFamily={fontFamily.mono}
              color={color.text.muted}
              flexShrink={0}
              whiteSpace="nowrap"
            >
              {req.durationMs}ms
            </Block>
          )}
        </Row>
      ))}
    </Col>
  );
};
