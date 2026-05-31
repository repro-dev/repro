import { Block, Col, Row } from '@jsxstyle/react'
import { Button, color, Pagination, spacing, textStyles } from '@repro/design'
import {
  NetworkMessageType,
  type WebSocketInbound,
  type WebSocketOutbound,
} from '@repro/domain'
import { findWebSocketFramesForConnection } from '@repro/source-utils'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
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
    const frames = findWebSocketFramesForConnection(events, correlationId)

    return frames.map(f => ({
      time: f.time,
      direction:
        f.data.type === NetworkMessageType.WebSocketOutbound
          ? ('sent' as const)
          : ('received' as const),
      data: f.data,
    }))
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
                frame.direction === 'sent' ? color.infoTint : color.successTint
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

              <Col flex={1} gap={spacing.xs} minWidth={0}>
                {/* Timestamp */}
                <Block {...textStyles.caption} color={color.text.muted}>
                  {formatTimestamp(frame.time)}
                </Block>

                {/* Payload preview */}
                <Block
                  {...textStyles.code}
                  color={color.text.default}
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
        <Pagination
          currentPage={currentPage + 1}
          totalPages={totalPages}
          onPageChange={p => setPage(p - 1)}
        />
      )}
    </Col>
  )
}
