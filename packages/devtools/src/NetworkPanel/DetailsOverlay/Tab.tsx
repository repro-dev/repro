import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import React from 'react'

interface Props {
  active: boolean
  label: string
  onClick(): void
}

export const Tab: React.FC<Props> = ({ active, label, onClick }) => (
  <Block
    paddingV={8}
    fontSize={11}
    color={active ? colors.blue['700'] : colors.slate['500']}
    borderBottom={`2px solid ${active ? colors.blue['700'] : 'transparent'}`}
    cursor="pointer"
    props={{ onClick }}
  >
    {label}
  </Block>
)
