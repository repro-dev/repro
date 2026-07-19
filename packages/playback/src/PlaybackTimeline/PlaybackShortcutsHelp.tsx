import { Block, Col, Row } from '@jsxstyle/react'
import { Popover, color, fontSize, radius, spacing } from '@repro/design'
import { CircleHelp as HelpIcon } from 'lucide-react'
import React from 'react'
import { Keycap } from './Keycap'

const SHORTCUTS = [
  { key: 'Space', action: 'Play / Pause' },
  { key: '←', action: 'Seek backward 5s' },
  { key: '→', action: 'Seek forward 5s' },
  { key: 'Home', action: 'Jump to start' },
  { key: 'End', action: 'Jump to end' },
  { key: '+', action: 'Increase speed' },
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
        props={{ 'aria-label': 'Keyboard shortcuts', role: 'button' }}
      >
        <HelpIcon size={14} />
      </Row>
    </Popover.Trigger>
    <Popover.Content
      aria-label="Playback keyboard shortcuts"
      side="top"
      align="end"
    >
      <Col gap={spacing.md}>
        {SHORTCUTS.map(({ key, action }) => (
          <Row key={key} gap={spacing.md} alignItems="center">
            <Block
              minWidth={24}
              textAlign="center"
              borderRadius={radius.sm}
              backgroundColor={color.bg.hover}
            >
              <Keycap muted label={key} />
            </Block>
            <Block
              fontSize={fontSize.sm}
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
