import { Block, Inline, Row } from '@jsxstyle/react'
import { useAtomValue } from '@repro/atom'
import { color, Tooltip, transition } from '@repro/design'
import { SourceEventType, SourceEventView, StateEventType } from '@repro/domain'
import { usePlayback } from '@repro/playback'
import {
  AlertTriangle as ConsoleIcon,
  Code as ElementsIcon,
  Globe as NetworkIcon,
  Layers as ReduxIcon,
} from 'lucide-react'
import React, { useMemo } from 'react'
import { useDevToolsView, useInspecting } from '../hooks'
import { View } from '../types'

const ReactLogo: React.FC = () => (
  <svg
    viewBox="-11.5 -10.23 23 20.46"
    width="14"
    height="14"
    fill="currentColor"
    aria-hidden="true"
  >
    <circle r="2.05" />
    <g stroke="currentColor" strokeWidth="1" fill="none">
      <ellipse rx="11" ry="4.2" />
      <ellipse rx="11" ry="4.2" transform="rotate(60)" />
      <ellipse rx="11" ry="4.2" transform="rotate(120)" />
    </g>
  </svg>
)

function useHasReactEvents(): boolean {
  const playback = usePlayback()
  // Subscribe to $buffer so this re-evaluates when new events arrive during live recording
  const buffer = useAtomValue(playback.$buffer)
  return useMemo(() => {
    const sourceEvents = playback.getSourceEvents().toSource()
    for (const view of sourceEvents) {
      const event = SourceEventView.over(view)
      let found = false
      event.apply(e => {
        if (e.type === SourceEventType.State) {
          e.data.apply(inner => {
            if (inner.type === StateEventType.ReactCommit) {
              found = true
            }
          })
        }
      })
      if (found) return true
    }
    return false
  }, [playback, buffer])
}

function useHasReduxEvents(): boolean {
  const playback = usePlayback()
  // Subscribe to $buffer so this re-evaluates when new events arrive during live recording
  const buffer = useAtomValue(playback.$buffer)
  return useMemo(() => {
    const sourceEvents = playback.getSourceEvents().toSource()
    for (const view of sourceEvents) {
      const event = SourceEventView.over(view)
      let found = false
      event.apply(e => {
        if (e.type === SourceEventType.State) {
          e.data.apply(inner => {
            if (inner.type === StateEventType.ReduxDispatch) {
              found = true
            }
          })
        }
      })
      if (found) return true
    }
    return false
  }, [playback, buffer])
}

export const Tabs: React.FC = () => {
  const hasReactEvents = useHasReactEvents()
  const hasReduxEvents = useHasReduxEvents()

  return (
    <Row alignItems="center" gap={4} marginH={4}>
      <Item
        view={View.Elements}
        icon={<ElementsIcon size={14} />}
        label="Elements"
      />

      <Item
        view={View.Console}
        icon={<ConsoleIcon size={14} />}
        label="Console"
      />

      <Item
        view={View.Network}
        icon={<NetworkIcon size={14} />}
        label="Network"
      />

      {hasReactEvents && (
        <Item view={View.React} icon={<ReactLogo />} label="React" />
      )}

      {hasReduxEvents && (
        <Item view={View.Redux} icon={<ReduxIcon size={14} />} label="Redux" />
      )}
    </Row>
  )
}

interface ItemProps {
  view: View
  label: React.ReactNode
  icon: React.ReactNode
  disabled?: boolean
}

const Item: React.FC = ({ disabled, icon, label, view }) => {
  const [activeView, setActiveView] = useDevToolsView()
  const [inspecting, setInspecting] = useInspecting()

  const handleClick = () => {
    if (!disabled) {
      setActiveView(view)
      setInspecting(true)
    }
  }

  const tabColor = disabled
    ? color.border.strong
    : activeView === view && inspecting
    ? color.infoFg
    : color.primary

  const active = activeView === view && inspecting

  return (
    <Row
      alignItems="center"
      backgroundColor={active ? color.infoTint : 'transparent'}
      hoverBackgroundColor={active ? color.infoTint : color.bg.hover}
      color={tabColor}
      cursor="pointer"
      fontSize={11}
      gap={4}
      paddingH={8}
      blockSize={32}
      borderRadius={4}
      position="relative"
      transition={transition.default}
      userSelect="none"
      props={{
        onClick: handleClick,
      }}
    >
      <Block>
        {!inspecting && <Tooltip position="top">{label}</Tooltip>}
        {icon}
      </Block>

      {inspecting && <Inline>{label}</Inline>}
    </Row>
  )
}
