import { Inline, Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import {
  AlertTriangle as ConsoleIcon,
  Code as ElementsIcon,
  Globe as NetworkIcon,
} from 'lucide-react'
import React, { PropsWithChildren } from 'react'
import { useDevToolsView, useInspecting } from '../hooks'
import { View } from '../types'

export const Tabs: React.FC = () => {
  return (
    <Row alignItems="stretch">
      <Item view={View.Elements}>
        <ElementsIcon size={16} />
        <Inline>Elements</Inline>
      </Item>

      <Item view={View.Console}>
        <ConsoleIcon size={16} />
        <Inline>Console</Inline>
      </Item>

      <Item view={View.Network}>
        <NetworkIcon size={16} />
        <Inline>Network</Inline>
      </Item>
    </Row>
  )
}

interface ItemProps {
  view: View
  disabled?: boolean
}

const Item: React.FC<PropsWithChildren<ItemProps>> = ({
  children,
  disabled,
  view,
}) => {
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
    : activeView === view
    ? colors.blue['900']
    : colors.blue['700']

  return (
    <Row
      alignItems="center"
      borderBottomColor={
        inspecting && activeView === view ? colors.blue['500'] : 'transparent'
      }
      borderBottomStyle="solid"
      borderBottomWidth={2}
      color={color}
      cursor="pointer"
      fontSize={13}
      gap={5}
      marginH={10}
      paddingH={5}
      position="relative"
      userSelect="none"
      props={{
        onClick: handleClick,
      }}
    >
      {children}
    </Row>
  )
}
