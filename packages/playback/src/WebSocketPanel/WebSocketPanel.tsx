import { Block, Col, Row } from '@jsxstyle/react'
import { color, focusRing, spacing, textStyles } from '@repro/design'
import type { WebSocketGroup } from '@repro/source-utils'
import { WifiIcon, XIcon } from 'lucide-react'
import React, { useState } from 'react'
import { WebSocketConnectionList } from './WebSocketConnectionList'
import { WebSocketFrameInspector } from './WebSocketFrameInspector'

export const WebSocketPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedConnection, setSelectedConnection] =
    useState<WebSocketGroup | null>(null)

  const handleSelectConnection = (connection: WebSocketGroup) => {
    setSelectedConnection(connection)
    setIsOpen(true)
  }

  const handleClose = () => {
    setIsOpen(false)
    setSelectedConnection(null)
  }

  return (
    <Col
      borderTop={`1px solid ${color.border.default}`}
      backgroundColor={color.bg.surface}
      maxHeight={isOpen ? '300px' : 'auto'}
      overflow="hidden"
    >
      {/* Toggle bar */}
      <Row
        alignItems="center"
        gap={spacing.sm}
        paddingH={spacing.md}
        paddingV={spacing.sm}
        cursor="pointer"
        backgroundColor={color.bg.hover}
        flexShrink={0}
        {...focusRing()}
        props={{
          onClick: () => setIsOpen(!isOpen),
          role: 'button',
          tabIndex: 0,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setIsOpen(!isOpen)
            }
          },
        }}
      >
        <Block color={color.text.muted}>
          <WifiIcon size={16} />
        </Block>
        <Block {...textStyles.label} color={color.text.default}>
          WebSocket
        </Block>
        <Block flex={1} />
        {isOpen && selectedConnection && (
          <Row
            gap={spacing.sm}
            alignItems="center"
            {...focusRing()}
            props={{
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation()
                handleClose()
              },
              role: 'button',
              tabIndex: 0,
            }}
          >
            <Block color={color.text.muted}>
              <XIcon size={14} />
            </Block>
          </Row>
        )}
      </Row>

      {/* Expanded panel */}
      {isOpen && (
        <Row height="100%" flex={1} overflow="hidden">
          {/* Connection list sidebar */}
          <Col
            width="280px"
            flexShrink={0}
            overflowY="auto"
            borderRight={`1px solid ${color.border.default}`}
          >
            <WebSocketConnectionList
              onSelectConnection={handleSelectConnection}
              selectedCorrelationId={selectedConnection?.created.correlationId}
            />
          </Col>

          {/* Frame inspector */}
          <Col flex={1} overflow="hidden">
            {selectedConnection ? (
              <WebSocketFrameInspector
                correlationId={selectedConnection.created.correlationId}
              />
            ) : (
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
                  Select a connection to inspect frames
                </Block>
              </Col>
            )}
          </Col>
        </Row>
      )}
    </Col>
  )
}
