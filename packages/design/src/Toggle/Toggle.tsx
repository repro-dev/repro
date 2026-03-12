import { Block, Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { MINIMUM_FONT_SIZE } from '../tokens/typography'

export interface ToggleProps {
  label: string
  checked: boolean
  size?: 'small' | 'medium' | 'large'
  rounded?: boolean
  /** When true, dims the toggle and prevents interaction. */
  disabled?: boolean
  onChange(checked: boolean): void
}

const sizes = {
  small: 6,
  medium: 8,
  large: 10,
}

/**
 * Binary toggle switch. Renders a `<button>` with `role="switch"`.
 *
 * Use for boolean settings where the effect is immediate (no form submission).
 * For mutually exclusive options, use `ToggleGroup` instead.
 */
export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  (
    {
      label,
      checked,
      size = 'medium',
      rounded = true,
      disabled = false,
      onChange,
    },
    ref
  ) => {
    const base = sizes[size]
    const gutter = base / 2
    const padding = base / 4
    const borderWidth = 1
    const width = base * 4
    const height = base * 2 + padding * 2
    const control = base * 2 - padding
    const offset = (height - borderWidth * 2 - control) / 2
    const fontSize = Math.max(base * 1.5, MINIMUM_FONT_SIZE)

    return (
      <Row
        component="button"
        alignItems="center"
        gap={gutter}
        cursor={disabled ? 'not-allowed' : 'pointer'}
        opacity={disabled ? 0.5 : 1}
        background="none"
        border="none"
        fontFamily="inherit"
        padding={0}
        props={{
          ref,
          type: 'button',
          role: 'switch',
          'aria-checked': checked,
          'aria-disabled': disabled || undefined,
          disabled,
          onClick: disabled ? undefined : () => onChange(!checked),
        }}
        {...focusRing()}
      >
        <Block
          height={height}
          width={width}
          backgroundColor={color.border.strong}
          border={`1px solid ${color.border.emphasis}`}
          borderRadius={rounded ? radius.full : radius.none}
        >
          <Block
            height={control}
            width={control}
            backgroundColor={
              checked ? color.bg.emphasis : color.border.emphasis
            }
            borderRadius={rounded ? radius.full : radius.none}
            transform={`translate(${
              checked
                ? `${width - borderWidth * 2 - control - offset}px`
                : `${offset}px`
            }, ${offset}px)`}
            transition={transition.fast}
          />
        </Block>
        <Block fontSize={fontSize}>{label}</Block>
      </Row>
    )
  }
)

Toggle.displayName = 'Toggle'
