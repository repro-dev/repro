import { Block, Row } from '@jsxstyle/react'
import React from 'react'
import { focusRing } from '../tokens/interaction'
import { color } from '../tokens/colors'

interface Props {
  label: string
  checked: boolean
  size?: 'small' | 'medium' | 'large'
  rounded?: boolean
  onChange(checked: boolean): void
}

const sizes = {
  small: 6,
  medium: 8,
  large: 10,
}

const MINIMUM_FONT_SIZE = 12

export const Toggle: React.FC<Props> = ({
  label,
  checked,
  size = 'medium',
  rounded = true,
  onChange,
}) => {
  const base = sizes[size]
  const gutter = base / 2
  const padding = base / 4
  const width = base * 4
  const height = base * 2 + padding * 2
  const control = base * 2 - padding
  const fontSize = Math.max(base * 1.5, MINIMUM_FONT_SIZE)

  return (
    <Row
      component="button"
      alignItems="center"
      gap={gutter}
      cursor="pointer"
      background="none"
      border="none"
      fontFamily="inherit"
      padding={0}
      props={{
        type: 'button',
        role: 'switch',
        'aria-checked': checked,
        onClick: () => onChange(!checked),
      }}
      {...focusRing()}
    >
      <Block
        height={height}
        width={width}
        backgroundColor={color.border.strong}
        border={`1px solid ${color.border.emphasis}`}
        borderRadius={rounded ? '99rem' : 0}
      >
        <Block
          height={control}
          width={control}
          backgroundColor={checked ? color.bg.emphasis : color.border.emphasis}
          borderRadius={rounded ? '99rem' : 0}
          transform={`translate(${checked ? '100%' : '2px'}, 2px)`}
          transition="all 100ms linear"
        />
      </Block>
      <Block fontSize={fontSize}>{label}</Block>
    </Row>
  )
}
