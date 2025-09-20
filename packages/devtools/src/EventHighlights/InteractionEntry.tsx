import { Block, Row } from '@jsxstyle/react'
import { colors, ElementR } from '@repro/design'
import { Click, InteractionEvent, InteractionType } from '@repro/domain'
import {
  MousePointerClick as ClickIcon,
  Link2 as LinkIcon,
  Scaling as ViewportResizeIcon,
} from 'lucide-react'
import React from 'react'
import { useDevToolsView, useSelectedNode } from '../hooks'
import { View } from '../types'
import { BaseEntry } from './BaseEntry'

interface Props {
  eventIndex: number
  event: InteractionEvent
}

const icons = {
  // Ignored interaction events
  [InteractionType.KeyUp]: null,
  [InteractionType.KeyDown]: null,
  [InteractionType.Scroll]: null,
  [InteractionType.PointerUp]: null,
  [InteractionType.PointerDown]: null,
  [InteractionType.PointerMove]: null,
  [InteractionType.PageTransition]: null,

  [InteractionType.ViewportResize]: (
    <ViewportResizeIcon size={16} color={colors.blue['500']} />
  ),

  [InteractionType.Click]: <ClickIcon size={16} color={colors.blue['500']} />,

  [InteractionType.DoubleClick]: (
    <ClickIcon size={16} color={colors.blue['500']} />
  ),
}

export const InteractionEntry: React.FC<Props> = ({ eventIndex, event }) => {
  const [, setSelectedNode] = useSelectedNode()
  const [, setView] = useDevToolsView()

  return event.data
    .map(data => {
      const icon = icons[data.type]

      const label =
        data.type === InteractionType.Click ? createClickLabel(data) : null

      function onClick() {
        if (data.type === InteractionType.Click) {
          const firstTarget = data.targets[0]

          if (firstTarget) {
            setSelectedNode(firstTarget)
            setView(View.Elements)
          }
        }
      }

      return (
        <BaseEntry
          eventIndex={eventIndex}
          event={event}
          icon={icon}
          onClick={onClick}
        >
          {label}
        </BaseEntry>
      )
    })
    .orElse(null)
}

function createClickLabel(interaction: Click): React.ReactNode {
  const tagName = interaction.meta.node.tagName
  const isLinkElement = tagName === 'a'

  let content: React.ReactNode

  if (isLinkElement) {
    content = (
      <Row
        alignItems="center"
        gap={5}
        paddingH={6}
        paddingV={3}
        borderRadius={4}
        backgroundColor={colors.blue['100']}
        color={colors.blue['900']}
      >
        <LinkIcon size={14} color={colors.blue['900']} strokeWidth={3} />
        <Block>{interaction.meta.humanReadableLabel}</Block>
      </Row>
    )
  } else {
    content = (
      <Row
        alignItems="center"
        paddingH={6}
        paddingV={3}
        fontFamily="monospace"
        backgroundColor={colors.blue['50']}
        borderRadius={4}
      >
        <ElementR.Open node={interaction.meta.node} />
      </Row>
    )
  }

  return (
    <Row alignItems="center" gap={5}>
      <Block>Clicked</Block>
      {content}
    </Row>
  )
}
