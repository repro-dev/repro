import { Block, Col, Row } from '@jsxstyle/react'
import {
  color,
  fontFamily,
  fontSize,
  fontWeight,
  spacing,
  textStyles,
} from '@repro/design'
import React from 'react'
import { ToolResultSemanticGrid } from './ToolResultSemanticGrid'
import { TOOL_RESULT_ROW_STYLES } from './toolResultRowStyles'

export interface NetworkRequest {
  timeMs: number
  type: string
  method?: string
  url: string
  status?: number
  durationMs?: number
  contentType?: string
  errorBody?: string
  requestBody?: string
  responseTimeMs?: number
  headers?: Record<string, string>
}

export interface NetworkRequestResult {
  requests: NetworkRequest[]
  hint?: string
}

interface NetworkRequestResultViewProps {
  result: NetworkRequestResult
  onGoToTime?: (timeMs: number) => void
}

type BadgeContext = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

// Returns a semantic colour for HTTP status codes.
function statusToContext(status: number): BadgeContext {
  if (status >= 500) return 'danger'
  if (status >= 400) return 'warning'
  if (status >= 200 && status < 300) return 'success'
  return 'neutral'
}

// Truncate a URL for display. Long URLs are cut at 80 chars with an ellipsis.
function truncateUrl(url: string, maxLen = 80): string {
  if (url.length <= maxLen) return url
  return url.slice(0, maxLen - 1) + '…'
}

interface NetworkRequestResultRowProps {
  request: NetworkRequest
  index: number
  onGoToTime?: (timeMs: number) => void
}

export const NetworkRequestResultRow: React.FC<
  NetworkRequestResultRowProps
> = ({ request: req, index, onGoToTime }) => (
  <ToolResultSemanticGrid
    key={index}
    timeMs={req.timeMs}
    kind="network"
    onGoToTime={onGoToTime}
    gridTemplateColumns="auto auto auto 1fr"
  >
    <Block
      id={`network-request-line-1-${index}`}
      minWidth={0}
      paddingLeft={TOOL_RESULT_ROW_STYLES.rowContentShift}
      fontSize={fontSize.xs}
      fontFamily={fontFamily.mono}
      fontWeight={fontWeight.semibold}
      color={color.text.secondary}
      whiteSpace="nowrap"
    >
      {req.type === 'ws' ? 'WS' : req.type}
    </Block>

    {req.status != null && (
      <Block
        fontSize={fontSize.xs}
        fontFamily={fontFamily.mono}
        fontWeight={fontWeight.semibold}
        color={
          statusToContext(req.status) === 'danger'
            ? color.danger
            : statusToContext(req.status) === 'warning'
            ? color.warning
            : statusToContext(req.status) === 'success'
            ? color.success
            : color.text.muted
        }
      >
        {req.status}
      </Block>
    )}

    {req.durationMs != null && (
      <Row width="100%" justifyContent="flex-end" gridColumn="-1">
        <Block
          fontSize={fontSize.xs}
          fontFamily={fontFamily.mono}
          color={color.text.muted}
          whiteSpace="nowrap"
        >
          {req.durationMs}ms
        </Block>
      </Row>
    )}

    <Block
      id={`network-request-line-2-${index}`}
      minWidth={0}
      width="100%"
      lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
      gridColumn="1 / -1"
    >
      <Row
        alignItems="center"
        gap={TOOL_RESULT_ROW_STYLES.gap}
        lineHeight={TOOL_RESULT_ROW_STYLES.rowLineHeight}
      >
        {req.method != null && req.type !== 'ws' && (
          <Block
            flexShrink={0}
            fontSize={fontSize.xs}
            fontFamily={fontFamily.mono}
            color={color.text.secondary}
            fontWeight={fontWeight.semibold}
            whiteSpace="nowrap"
          >
            {req.method.toUpperCase()}
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

        {req.contentType != null && (
          <Block
            flexShrink={0}
            fontSize={fontSize.xs}
            fontFamily={fontFamily.mono}
            color={color.text.muted}
            whiteSpace="nowrap"
          >
            {req.contentType}
          </Block>
        )}
      </Row>
    </Block>
  </ToolResultSemanticGrid>
)

export const NetworkRequestResultView: React.FC<
  NetworkRequestResultViewProps
> = ({ result, onGoToTime }) => {
  const { requests, hint } = result

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
    )
  }

  return (
    <Col>
      {requests.map((req, i) => (
        <NetworkRequestResultRow
          key={i}
          request={req}
          index={i}
          onGoToTime={onGoToTime}
        />
      ))}
    </Col>
  )
}
