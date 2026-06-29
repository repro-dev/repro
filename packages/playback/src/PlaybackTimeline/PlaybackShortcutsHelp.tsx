import { Block, Col, Row } from '@jsxstyle/react'
import { Popover, color, fontFamily, fontSize, spacing } from '@repro/design'
import { Keyboard as KeyboardIcon } from 'lucide-react'
import React from 'react'

const SHORTCUTS = [
  { key: 'Space', action: 'Play / Pause' },
  { key: '←', action: 'Seek backward 5s' },
  { key: '→', action: 'Seek forward 5s' },
  { key: 'Home', action: 'Jump to start' },
  { key: 'End', action: 'Jump to end' },
  { key: '=', action: 'Increase speed' },
  { key: '-', action: 'Decrease speed' },
] as const

export const PlaybackShortcutsHelp: React.FC = () => (
  <Popover>
    <Popover.Trigger>
      <Row
        alignItems="center"
        justifyContent="center"
        width={32}
        height={32}
        color={color.primary}
        borderRadius={4}
        cursor="pointer"
        props={{
          'aria-label': 'Keyboard shortcuts',
        }}
      >
        <KeyboardIcon size={14} />
      </Row>
    </Popover.Trigger>
    <Popover.Content
      aria-label="Playback keyboard shortcuts"
      side="top"
      align="start"
    >
      <Col gap={spacing.sm}>
        {SHORTCUTS.map(({ key, action }) => (
          <Row key={key} gap={spacing.md} alignItems="center">
            <Block
              fontFamily={fontFamily.mono}
              fontSize={fontSize.xs}
              color={color.primary}
              whiteSpace="nowrap"
              minWidth={60}
            >
              {key}
            </Block>
            <Block
              fontSize={fontSize.xs}
              color={color.text.secondary}
              whiteSpace="nowrap"
            >
              {action}
            </Block>
          </Row>
        ))}
      </Col>
    </Popover.Content>
  </Popover>
)
