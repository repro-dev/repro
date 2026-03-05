import { Block, Col, Row } from '@jsxstyle/react'
import { Check } from 'lucide-react'
import React, { forwardRef, useId } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusWithinRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { MINIMUM_FONT_SIZE } from '../tokens/typography'

export interface CheckboxProps {
  label: string
  checked: boolean
  onChange(checked: boolean): void
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  description?: string
}

const sizes = {
  small: 6,
  medium: 8,
  large: 10,
}

/**
 * Checkbox input with custom visual styling. Renders a native `<input
 * type="checkbox">` for form compatibility and accessibility, with a custom
 * visual indicator and label.
 *
 * Use for boolean fields in forms. For immediate-effect toggles (no form
 * submission), prefer `Toggle` instead.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    { label, checked, onChange, size = 'medium', disabled = false, description },
    ref
  ) => {
    const id = useId()
    const base = sizes[size]
    const indicatorSize = base * 2
    const iconSize = base * 1.5
    const fontSize = Math.max(base * 1.5, MINIMUM_FONT_SIZE)

    return (
      <Row
        component="label"
        alignItems="flex-start"
        gap={spacing.md}
        cursor={disabled ? 'not-allowed' : 'pointer'}
        opacity={disabled ? 0.5 : 1}
        props={{ htmlFor: id }}
        {...focusWithinRing()}
        borderRadius={radius.sm}
      >
        <Block position="relative" height={indicatorSize} width={indicatorSize}>
          <Block
            component="input"
            position="absolute"
            width={1}
            height={1}
            overflow="hidden"
            opacity={0}
            props={{
              ref,
              id,
              type: 'checkbox',
              checked,
              disabled,
              onChange: () => onChange(!checked),
            }}
          />

          <Block
            height={indicatorSize}
            width={indicatorSize}
            backgroundColor={checked ? color.primary : color.bg.surface}
            borderRadius={radius.sm}
            border={checked ? 'none' : `1px solid ${color.border.strong}`}
            transition={transition.fast}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {checked && (
              <Check
                size={iconSize}
                color={color.text.inverse}
                strokeWidth={3}
              />
            )}
          </Block>
        </Block>

        <Col gap={spacing.xs} paddingTop={1}>
          <Block fontSize={fontSize} color={color.text.default} lineHeight={1}>
            {label}
          </Block>
          {description && (
            <Block
              fontSize={Math.max(base * 1.25, MINIMUM_FONT_SIZE)}
              color={color.text.secondary}
              lineHeight={1.3}
            >
              {description}
            </Block>
          )}
        </Col>
      </Row>
    )
  }
)

Checkbox.displayName = 'Checkbox'
