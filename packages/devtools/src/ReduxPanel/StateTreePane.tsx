import { Block } from '@jsxstyle/react'
import { color, colors } from '@repro/design'
import React from 'react'
import { JSONView } from '../JSONView/JSONView'

interface Props {
  state: Record<string, unknown>
}

export const StateTreePane: React.FC<Props> = ({ state }) => {
  if (Object.keys(state).length === 0) {
    return (
      <Block padding={16} fontSize={12} color={colors.slate['400']}>
        Redux state not yet available.
      </Block>
    )
  }

  return (
    <Block padding={8}>
      <Block
        fontSize={11}
        fontWeight={600}
        color={color.text.label}
        marginBottom={8}
        paddingBottom={4}
        borderBottom={`1px solid ${color.border.default}`}
      >
        Current State
      </Block>
      <JSONView data={state} />
    </Block>
  )
}
