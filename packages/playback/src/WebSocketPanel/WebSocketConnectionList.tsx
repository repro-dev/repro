import { Block, Col, Row } from '@jsxstyle/react'
import { color, spacing, textStyles } from '@repro/design'
import type { WebSocketGroup } from '@repro/source-utils'
import { findWebSocketConnections } from '@repro/source-utils'
import { GlobeIcon, WifiIcon } from 'lucide-react'
import React, { useMemo } from 'react'
import { usePlayback } from '../hooks'

interface Props {
  onSelectConnection: (connection: WebSocketGroup) => void
  selectedCorrelationId?: string
}

export const WebSocketConnectionList: React.FC<Props> = ({
  onSelectConnection,
  selectedCorrelationId,
}) => {
  const playback = usePlayback()

  const connections = useMemo(() => {
    const events = playback.getSourceEvents()
    return findWebSocketConnections(events)
  }, [playback])

  if (connections.length === 0) {
    return (
      <Col
        alignItems="center"
        justifyContent="center"
        padding={spacing.xl}
        gap={spacing.md}
      >
        <Block color={color.text.muted}>
          <WifiIcon size={24} />
        </Block>
        <Block component="p" {...textStyles.body} color={color.text.secondary}>
          No WebSocket connections recorded
        </Block>
      </Col>
    )
  }

  return (
    <Col gap={spacing.xs}>
      <Block
        padding={spacing.md}
        {...textStyles.caption}
        color={color.text.secondary}
        borderBottom={`1px solid ${color.border.default}`}
      >
        WebSocket Connections ({connections.length})
      </Block>

      {connections.map(connection => (
        <Row
          key={connection.created.correlationId}
          paddingH={spacing.md}
          paddingV={spacing.sm}
          alignItems="center"
          gap={spacing.sm}
          cursor="pointer"
          backgroundColor={
            selectedCorrelationId === connection.created.correlationId
              ? color.bg.hover
              : undefined
          }
          props={{
            onClick: () => onSelectConnection(connection),
            role: 'button',
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onSelectConnection(connection)
              }
            },
          }}
        >
          <Block color={color.text.muted} flexShrink={0}>
            <GlobeIcon size={14} />
          </Block>

          <Col flex={1} gap={2} minWidth={0}>
            <Block
              {...textStyles.label}
              color={color.text.default}
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              maxWidth="100%"
            >
              {connection.created.url}
            </Block>

            <Row gap={spacing.md} alignItems="center">
              <Block {...textStyles.caption} color={color.text.muted}>
                {connection.messageCountSent + connection.messageCountReceived}{' '}
                msgs
              </Block>

              <Block {...textStyles.caption} color={color.text.muted}>
                {connection.close ? 'Closed' : 'Open'}
              </Block>
            </Row>
          </Col>
        </Row>
      ))}
    </Col>
  )
}
