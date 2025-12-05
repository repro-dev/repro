import { Block, Inline, Row } from '@jsxstyle/react'
import { colors, Tooltip } from '@repro/design'
import {
  AlertTriangle as ConsoleIcon,
  Code as ElementsIcon,
  Globe as NetworkIcon,
} from 'lucide-react'
import React from 'react'
import { useDevToolsView, useInspecting } from '../hooks'
import { View } from '../types'

export const Tabs: React.FC = () => {
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
    </Row>
  )
}

interface ItemProps {
  view: View
  label: React.ReactNode
  icon: React.ReactNode
  disabled?: boolean
}

const Item: React.FC<ItemProps> = ({ disabled, icon, label, view }) => {
  const [activeView, setActiveView] = useDevToolsView()
  const [inspecting, setInspecting] = useInspecting()

  const handleClick = () => {
    if (!disabled) {
      setActiveView(view)
      setInspecting(true)
    }
  }

  const color = disabled
    ? colors.slate['300']
    : activeView === view && inspecting
    ? colors.blue['900']
    : colors.blue['700']

  const active = activeView === view && inspecting

  return (
    <Row
      alignItems="center"
      backgroundColor={active ? colors.blue['50'] : 'transparent'}
      hoverBackgroundColor={active ? colors.blue['50'] : colors.slate['100']}
      color={color}
      cursor="pointer"
      fontSize={11}
      gap={4}
      paddingH={8}
      blockSize={32}
      borderRadius={4}
      position="relative"
      transition="all linear 250ms"
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
