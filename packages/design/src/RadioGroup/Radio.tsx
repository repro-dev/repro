import { Block, Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusWithinRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { fontSize, lineHeight } from '../tokens/typography'
import { MINIMUM_FONT_SIZE } from '../tokens/typography'
import { useRadioGroupContext } from './RadioGroupContext'

export interface RadioProps {
  value: string
  label: string
  disabled?: boolean
  description?: string
}

const sizes = {
  small: 6,
  medium: 8,
  large: 10,
}

/**
 * A single radio option. Must be used as a child of `RadioGroup`.
 *
 * Renders a hidden native `<input type="radio">` with a custom circular
 * visual indicator. The checked and disabled states are derived from
 * the parent `RadioGroup` context.
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ value, label, disabled: disabledProp = false, description }, ref) => {
    const ctx = useRadioGroupContext()
    const checked = ctx.value === value
    const disabled = ctx.disabled || disabledProp
    const base = sizes[ctx.size]
    const indicatorSize = base * 2
    const innerSize = base
    const labelFontSize = Math.max(base * 1.5, MINIMUM_FONT_SIZE)

    return (
      <Row
        component="label"
        alignItems="flex-start"
        gap={spacing.md}
        cursor={disabled ? 'not-allowed' : 'pointer'}
        opacity={disabled ? 0.5 : 1}
        transition={transition.fast}
        borderRadius={radius.sm}
        {...focusWithinRing()}
      >
        <input
          ref={ref}
          type="radio"
          name={ctx.name}
          value={value}
          checked={checked}
          disabled={disabled}
          aria-checked={checked}
          tabIndex={checked ? 0 : -1}
          onChange={() => ctx.onChange(value)}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            margin: -1,
            padding: 0,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        />

        <Block
          flexShrink={0}
          width={indicatorSize}
          height={indicatorSize}
          borderRadius={radius.full}
          borderWidth={checked ? indicatorSize / 2 - innerSize / 2 : 2}
          borderStyle="solid"
          borderColor={checked ? color.primary : color.border.strong}
          backgroundColor={color.bg.surface}
          transition={transition.fast}
          marginTop={Math.round((labelFontSize * lineHeight.relaxed - indicatorSize) / 2)}
          props={{ 'aria-hidden': true }}
        />

        <Block>
          <Block
            fontSize={labelFontSize}
            lineHeight={lineHeight.relaxed}
            color={disabled ? color.text.muted : color.text.default}
          >
            {label}
          </Block>

          {description && (
            <Block
              fontSize={fontSize.xs}
              lineHeight={lineHeight.relaxed}
              color={disabled ? color.text.muted : color.text.secondary}
              marginTop={spacing.xs}
            >
              {description}
            </Block>
          )}
        </Block>
      </Row>
    )
  }
)

Radio.displayName = 'Radio'
