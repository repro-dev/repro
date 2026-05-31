import { Block, Col, Row } from '@jsxstyle/react'
import { Button, color, spacing, textStyles } from '@repro/design'
import {
  NetworkMessageType,
  SourceEventView,
  type WebSocketInbound,
  type WebSocketOutbound,
} from '@repro/domain'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { usePlayback } from '../hooks'

const PAGE_SIZE = 50

function formatTimestamp(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

function formatPayloadPreview(
  data: WebSocketInbound | WebSocketOutbound
): string {
  if (data.messageType === 1) {
    // Binary
    if (data.preview) {
      return `Binary (${data.data.byteLength} bytes): ${data.preview}`
    }
    return `Binary (${data.data.byteLength} bytes)`
  }

  // Text
  const decoder = new TextDecoder()
  const text = decoder.decode(data.data)

  if (data.preview) {
    return data.preview
  }

  if (text.length > 200) {
    return text.slice(0, 200) + '...'
  }

  return text
}

interface Props {
  correlationId: string
}

export const WebSocketFrameInspector: React.FC<Props> = ({ correlationId }) => {
  const playback = usePlayback()
  const [directionFilter, setDirectionFilter] = useState<
    'all' | 'sent' | 'received'
  >('all')
  const [page, setPage] = useState(0)

  const allFrames = useMemo(() => {
    const events = playback.getSourceEvents()
    const frames: Array<{
      time: number
      direction: 'sent' | 'received'
      data: WebSocketInbound | WebSocketOutbound
    }> = []

    const arr = events.toArray()
    for (let i = 0; i < arr.length; i++) {
      const view = arr[i]
      if (!view) continue

      const event = SourceEventView.over(view).unwrap()
      if (!event || event.type !== 30 /* Network */) continue

      const data = (event as any).data
      const inner = data?.value
      if (!inner) continue

      if (
        inner.correlationId === correlationId &&
        (inner.type === NetworkMessageType.WebSocketInbound ||
          inner.type === NetworkMessageType.WebSocketOutbound)
      ) {
        frames.push({
          time: event.time,
          direction:
            inner.type === NetworkMessageType.WebSocketOutbound
              ? 'sent'
              : 'received',
          data: inner,
        })
      }
    }

    return frames.sort((a, b) => a.time - b.time)
  }, [playback, correlationId])

  const filteredFrames = useMemo(() => {
    if (directionFilter === 'all') return allFrames
    return allFrames.filter(f => f.direction === directionFilter)
  }, [allFrames, directionFilter])

  const totalPages = Math.ceil(filteredFrames.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(0, totalPages - 1))
  const pageFrames = filteredFrames.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  )

  return (
    <Col gap={spacing.xs} height="100%">
      {/* Header with filter controls */}
      <Row
        alignItems="center"
        gap={spacing.sm}
        padding={spacing.md}
        borderBottom={`1px solid ${color.border.default}`}
        flexShrink={0}
      >
        <Button
          size="small"
          variant={directionFilter === 'all' ? 'contained' : 'text'}
          onClick={() => {
            setDirectionFilter('all')
            setPage(0)
          }}
        >
          All
        </Button>
        <Button
          size="small"
          variant={directionFilter === 'sent' ? 'contained' : 'text'}
          onClick={() => {
            setDirectionFilter('sent')
            setPage(0)
          }}
        >
          Sent
        </Button>
        <Button
          size="small"
          variant={directionFilter === 'received' ? 'contained' : 'text'}
          onClick={() => {
            setDirectionFilter('received')
            setPage(0)
          }}
        >
          Received
        </Button>

        <Block flex={1} />

        <Block {...textStyles.caption} color={color.text.muted}>
          {filteredFrames.length} frames
        </Block>
      </Row>

      {/* Frame list */}
      <Col flex={1} overflowY="auto" gap={0}>
        {pageFrames.length === 0 ? (
          <Col
            alignItems="center"
            justifyContent="center"
            padding={spacing.xl}
            gap={spacing.md}
          >
            <Block
              component="p"
              {...textStyles.body}
              color={color.text.secondary}
            >
              No frames to display
            </Block>
          </Col>
        ) : (
          pageFrames.map((frame, idx) => (
            <Row
              key={`${frame.time}-${idx}`}
              paddingH={spacing.md}
              paddingV={spacing.sm}
              gap={spacing.sm}
              alignItems="flex-start"
              borderBottom={`1px solid ${color.border.default}`}
              backgroundColor={
                frame.direction === 'sent'
                  ? 'rgba(59, 130, 246, 0.03)'
                  : 'rgba(34, 197, 94, 0.03)'
              }
            >
              {/* Direction icon */}
              <Block
                color={frame.direction === 'sent' ? color.info : color.success}
                flexShrink={0}
                paddingTop={2}
              >
                {frame.direction === 'sent' ? (
                  <ArrowUpIcon size={12} />
                ) : (
                  <ArrowDownIcon size={12} />
                )}
              </Block>

              <Col flex={1} gap={2} minWidth={0}>
                {/* Timestamp */}
                <Block {...textStyles.caption} color={color.text.muted}>
                  {formatTimestamp(frame.time)}
                </Block>

                {/* Payload preview */}
                <Block
                  {...textStyles.code}
                  color={color.text.default}
                  fontSize={12}
                  lineHeight="18px"
                  overflow="hidden"
                  whiteSpace="pre-wrap"
                  wordBreak="break-all"
                  maxHeight={60}
                >
                  {formatPayloadPreview(frame.data)}
                </Block>
              </Col>

              {/* Type badge */}
              <Block
                {...textStyles.caption}
                color={color.text.muted}
                flexShrink={0}
              >
                {frame.data.messageType === 0 ? 'text' : 'binary'}
              </Block>
            </Row>
          ))
        )}
      </Col>

      {/* Pagination */}
      {totalPages > 1 && (
        <Row
          alignItems="center"
          justifyContent="center"
          gap={spacing.sm}
          padding={spacing.sm}
          borderTop={`1px solid ${color.border.default}`}
          flexShrink={0}
        >
          <Button
            size="small"
            variant="text"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeftIcon size={14} />
          </Button>

          <Block {...textStyles.caption} color={color.text.secondary}>
            Page {currentPage + 1} of {totalPages}
          </Block>

          <Button
            size="small"
            variant="text"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRightIcon size={14} />
          </Button>
        </Row>
      )}
    </Col>
  )
}
