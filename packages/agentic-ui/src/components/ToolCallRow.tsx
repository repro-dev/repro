import { Block, Col, Row } from '@jsxstyle/react'
import { ContentBlock, ToolMessage, summarizeToolResult } from '@repro/agentic'
import {
  FX,
  color,
  focusRing,
  fontFamily,
  fontSize,
  radius,
  spacing,
  textStyles,
  transition,
} from '@repro/design'
import { AlertCircleIcon, ChevronRightIcon, WrenchIcon } from 'lucide-react'
import React, { useState } from 'react'

// Maps raw camelCase tool names to human-readable labels for display.
// Raw names are preserved in aria-label for developer context.
const TOOL_LABELS: Record<string, string> = {
  getRecordingDuration: 'Get recording duration',
  getConsoleMessages: 'Get console messages',
  getConsoleContext: 'Get console context',
  getNetworkRequests: 'Get network requests',
  getDOMState: 'Get DOM state',
  findErrors: 'Find errors',
  getElementDetails: 'Get element details',
  getEvents: 'Get events',
  getEventsAroundTime: 'Get events around time',
  captureScreenshot: 'Capture screenshot',
  getDOMDiff: 'Get DOM diff',
}

// Detects whether a tool result content JSON contains a top-level error key,
// indicating the tool call failed at runtime.
function isErrorResult(content: string | Array<ContentBlock>): boolean {
  if (typeof content !== 'string') {
    return false
  }
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return typeof parsed.error === 'string'
  } catch {
    return false
  }
}

interface ToolCallRowProps {
  toolName: string
  result: ToolMessage | null
  isExecuting: boolean
  wasCancelled: boolean
}

// Resolve tool message content to a plain string for display. When content
// is an array of vision content blocks (e.g. captureScreenshot), produce a
// human-readable summary rather than attempting to JSON-parse raw blocks.
function contentToString(content: string | Array<ContentBlock>): string {
  if (typeof content === 'string') {
    return content
  }
  const textBlock = content.find(b => b.type === 'text')
  if (textBlock && textBlock.type === 'text') {
    return textBlock.text
  }
  return '[vision content]'
}

interface ToolResultDetailProps {
  toolName: string
  content: string | Array<ContentBlock>
}

// Renders a screenshot dataUrl as an inline image; falls back to pretty-printed
// JSON for all other tools. Handles both plain string and ContentBlock[] content.
const ToolResultDetail: React.FC<ToolResultDetailProps> = ({
  toolName,
  content,
}) => {
  if (toolName === 'captureScreenshot') {
    // Check for dataUrl in a ContentBlock array (image_url block)
    if (Array.isArray(content)) {
      const imageBlock = content.find(b => b.type === 'image_url')
      if (imageBlock && imageBlock.type === 'image_url') {
        return (
          <Block
            backgroundColor={color.bg.muted}
            borderRadius={radius.sm}
            padding={spacing.md}
            overflow="hidden"
          >
            <Block
              component="img"
              maxWidth="100%"
              display="block"
              borderRadius={radius.sm}
              props={{ src: imageBlock.image_url.url, alt: 'Screenshot' }}
            />
          </Block>
        )
      }
    }

    // Check for dataUrl in a plain JSON string (legacy / fallback path)
    if (typeof content === 'string') {
      let dataUrl: string | null = null
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>
        if (typeof parsed.dataUrl === 'string') {
          dataUrl = parsed.dataUrl
        }
      } catch {
        // fall through to JSON block below
      }

      if (dataUrl !== null) {
        return (
          <Block
            backgroundColor={color.bg.muted}
            borderRadius={radius.sm}
            padding={spacing.md}
            overflow="hidden"
          >
            <Block
              component="img"
              maxWidth="100%"
              display="block"
              borderRadius={radius.sm}
              props={{ src: dataUrl, alt: 'Screenshot' }}
            />
          </Block>
        )
      }
    }
  }

  const raw = contentToString(content)

  return (
    <Block
      fontSize={fontSize.xs}
      fontFamily={fontFamily.mono}
      color={color.text.secondary}
      backgroundColor={color.bg.muted}
      borderRadius={radius.sm}
      padding={spacing.md}
      overflowX="auto"
      whiteSpace="pre-wrap"
      wordBreak="break-all"
      component="pre"
    >
      {(() => {
        try {
          return JSON.stringify(JSON.parse(raw), null, 2)
        } catch {
          return raw
        }
      })()}
    </Block>
  )
}

export const ToolCallRow: React.FC<ToolCallRowProps> = ({
  toolName,
  result,
  isExecuting,
  wasCancelled,
}) => {
  const [expanded, setExpanded] = useState(false)

  const summary = result
    ? summarizeToolResult(toolName, contentToString(result.content))
    : null
  const hasError = result !== null && isErrorResult(result.content)
  const label = TOOL_LABELS[toolName] ?? toolName

  return (
    <Col>
      <Row
        alignItems="center"
        gap={spacing.sm}
        paddingV={spacing.sm}
        paddingH={spacing.md}
        cursor="pointer"
        borderRadius={radius.sm}
        hoverBackgroundColor={color.bg.hover}
        transition={transition.fast}
        component="button"
        background="none"
        border="none"
        padding={0}
        fontFamily="inherit"
        props={{
          type: 'button',
          onClick: () => setExpanded(prev => !prev),
          'aria-expanded': expanded,
          'aria-label': `Toggle details for ${toolName}`,
        }}
        {...focusRing()}
      >
        <Row alignItems="center" flexShrink={0} gap={spacing.xs}>
          <WrenchIcon
            size={12}
            color={hasError ? color.danger : color.text.muted}
          />
          {hasError && <AlertCircleIcon size={10} color={color.danger} />}
        </Row>

        <Block
          fontSize={fontSize.xs}
          color={hasError ? color.danger : color.text.secondary}
          flexGrow={1}
          textAlign="left"
        >
          {label}
        </Block>

        {isExecuting && result === null ? (
          // Pulsing dot while tool is running
          <Row alignItems="center" gap={spacing.xs}>
            <FX.Pulse>
              <Block
                width={6}
                height={6}
                borderRadius={radius.full}
                backgroundColor={color.text.muted}
              />
            </FX.Pulse>
          </Row>
        ) : wasCancelled && result === null ? (
          // Cancelled before result arrived
          <Block
            fontSize={fontSize.xs}
            color={color.text.muted}
            fontFamily={fontFamily.sans}
          >
            Cancelled
          </Block>
        ) : (
          // Normal result summary (or empty)
          <Block
            {...textStyles.caption}
            color={color.text.muted}
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
            flexShrink={1}
          >
            {summary}
          </Block>
        )}

        <Row
          alignItems="center"
          flexShrink={0}
          transform={expanded ? 'rotate(90deg)' : 'rotate(0deg)'}
          transition={transition.fast}
        >
          <ChevronRightIcon size={12} color={color.text.muted} />
        </Row>
      </Row>

      {expanded && result !== null && (
        <ToolResultDetail toolName={toolName} content={result.content} />
      )}
    </Col>
  )
}
