import { Block, Row } from '@jsxstyle/react'
import { color, colors } from '@repro/design'
import { NetworkEvent, NetworkMessageType } from '@repro/domain'
import {
  /* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing, @repro/oxlint-plugin-design/no-raw-palette */
  ArrowUp as FetchRequestIcon,
  ArrowUpDown as WebSocketIcon,
} from 'lucide-react'
import React from 'react'
import { useDevToolsView } from '../hooks'
import { View } from '../types'
import { BaseEntry } from './BaseEntry'

interface Props {
  eventIndex: number
  event: NetworkEvent
}

const icons = {
  // Ignored network events
  [NetworkMessageType.FetchResponse]: null,
  [NetworkMessageType.WebSocketClose]: null,
  [NetworkMessageType.WebSocketInbound]: null,
  [NetworkMessageType.WebSocketOutbound]: null,

  [NetworkMessageType.FetchRequest]: (
    <FetchRequestIcon size={16} color={colors.emerald['500']} />
  ),

  [NetworkMessageType.WebSocketOpen]: (
    <WebSocketIcon size={16} color={color.border.focus} />
  ),

  [NetworkMessageType.WebSocketError]: null,
}

export const NetworkEntry: React.FC<Props> = ({ eventIndex, event }) => {
  const [, setView] = useDevToolsView()

  return event.data
    .map(data => {
      const icon = icons[data.type]
      let content: React.ReactNode = null

      switch (data.type) {
        case NetworkMessageType.FetchRequest:
          content = (
            <Row alignItems="center" gap={5}>
              <Block
                padding={5}
                borderRadius={4}
                backgroundColor={color.bg.hover}
                color={color.text.secondary}
                fontSize={13}
                fontWeight={700}
                textTransform="uppercase"
              >
                {data.method}
              </Block>

              <Block>{data.url}</Block>
            </Row>
          )
          break

        case NetworkMessageType.WebSocketOpen:
          content = (
            <Row alignItems="center" gap={5}>
              <Block
                padding={5}
                borderRadius={4}
                backgroundColor={color.bg.hover}
                color={color.text.secondary}
                fontSize={13}
                fontWeight={700}
              >
                WS
              </Block>

              <Block>{data.url}</Block>
            </Row>
          )
          break

        case NetworkMessageType.WebSocketError:
          content = (
            <Row alignItems="center" gap={5}>
              <Block
                padding={5}
                borderRadius={4}
                backgroundColor={colors.red['100']}
                color={colors.red['700']}
                fontSize={13}
                fontWeight={700}
              >
                WS Error
              </Block>

              <Block color={color.text.muted}>{data.message}</Block>
            </Row>
          )
          break
      }

      function onClick() {
        setView(View.Network)
      }

      return (
        <BaseEntry
          eventIndex={eventIndex}
          event={event}
          icon={icon}
          onClick={onClick}
        >
          {content}
        </BaseEntry>
      )
    })
    .orElse(null)
}
/* eslint-enable */
