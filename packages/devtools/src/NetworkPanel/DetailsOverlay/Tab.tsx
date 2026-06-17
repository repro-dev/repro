import { Block } from '@jsxstyle/react'
import { color, spacing } from '@repro/design'
import React from 'react'

interface Props {
  active: boolean
  label: string
  onClick(): void
}

export const Tab: React.FC<Props> = ({ active, label, onClick }) => (
  <Block
    paddingV={spacing.md}
    fontSize={11}
    color={active ? color.primary : color.text.muted}
    borderBottom={`2px solid ${active ? color.primary : 'transparent'}`}
    cursor="pointer"
    props={{ onClick }}
  >
    {label}
  </Block>
)
