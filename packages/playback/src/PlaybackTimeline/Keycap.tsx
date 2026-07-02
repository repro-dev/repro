import { Block } from '@jsxstyle/react'
import { color, fontSize, radius, spacing } from '@repro/design'
import React from 'react'

export interface KeycapProps {
  label: string
  muted?: boolean
}

export const Keycap: React.FC<KeycapProps> = ({ label, muted }) => (
  /* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing */
  <Block
    component="kbd"
    fontFamily="monospace"
    fontSize={fontSize.xs}
    paddingH={spacing.xs}
    borderRadius={radius.sm}
    border={`1px solid ${muted ? color.text.muted : color.text.inverse}`}
    whiteSpace="nowrap"
    lineHeight={1}
    {...(!muted && { opacity: 0.8 })}
  >
    {label}
  </Block>
  /* eslint-enable @repro/oxlint-plugin-design/no-hardcoded-spacing */
)
