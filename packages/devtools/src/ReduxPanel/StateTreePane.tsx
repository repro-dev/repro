import { Block } from '@jsxstyle/react'
import { color, spacing } from '@repro/design'
import React from 'react'
import { JSONView } from '../JSONView/JSONView'
interface Props {
  state: Record<string, unknown>
}

export const StateTreePane: React.FC<Props> = ({ state }) => {
  if (Object.keys(state).length === 0) {
    return (
      <Block padding={spacing.xl} fontSize={12} color={color.text.muted}>
        Redux state not yet available.
      </Block>
    )
  }

  return (
    <Block padding={spacing.md}>
      <Block
        fontSize={11}
        fontWeight={600}
        color={color.text.label}
        marginBottom={spacing.md}
        paddingBottom={spacing.sm}
        borderBottom={`1px solid ${color.border.default}`}
      >
        Current State
      </Block>
      <JSONView data={state} />
    </Block>
  )
}
