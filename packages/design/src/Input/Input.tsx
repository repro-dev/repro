import { Block } from '@jsxstyle/react'
import React, { forwardRef, useRef } from 'react'
import type { MutableRefObject } from 'react'
import mergeRefs from 'react-merge-refs'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusWithinRing } from '../tokens/interaction'
import { MINIMUM_FONT_SIZE } from '../tokens/typography'

type Context = 'normal' | 'error'
type Size = 'small' | 'medium' | 'large' | 'xlarge'

export interface InputProps {
  'aria-describedby'?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  autoComplete?: string
  autoFocus?: boolean
  context?: Context
  disabled?: boolean
  id?: string
  max?: string | number
  maxLength?: number
  min?: string | number
  minLength?: number
  name?: string
  onBlur?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>
  onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
  pattern?: string
  placeholder?: string
  required?: boolean
  rows?: number
  size?: Size
  type?: string
}

const sizes = {
  small: 6,
  medium: 10,
  large: 12,
  xlarge: 16,
}

/**
 * Form text input with error styling and configurable validation attributes.
 *
 * Renders a single-line `<input>` by default, or a `<textarea>` when
 * `rows` is greater than 1. Pair with an external `<Label htmlFor>` for
 * accessible labeling. Stops keyboard event propagation to prevent
 * conflicts with global shortcuts.
 */
export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(
  (
    {
      autoFocus = false,
      context = 'normal',
      disabled = false,
      placeholder = '',
      rows = 1,
      size = 'medium',
      type = 'text',
      id,
      name,
      onBlur,
      onChange,
      'aria-describedby': ariaDescribedBy,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      ...restProps
    },
    outerRef
  ) => {
    const innerRef = useRef() as MutableRefObject<
      HTMLInputElement | HTMLTextAreaElement
    >
    const ref = mergeRefs([innerRef, outerRef])

    const fontSize = Math.max(sizes[size] * 1.5, MINIMUM_FONT_SIZE)

    if (process.env['NODE_ENV'] !== 'production') {
      if (!ariaLabel && !ariaLabelledBy && !id) {
        console.warn(
          'Input: No accessible label provided. Pass `aria-label`, `aria-labelledby`, or `id` (with a corresponding <Label htmlFor>) to ensure screen reader accessibility.'
        )
      }
    }

    function preventKeyCapture(evt: React.KeyboardEvent<HTMLElement>) {
      evt.stopPropagation()
    }

    return (
      <Block
        backgroundColor={color.bg.surface}
        borderColor={
          context === 'error' ? color.danger : color.border.strong
        }
        borderRadius={radius.sm}
        borderStyle="solid"
        borderWidth={1}
        boxShadow={`0 0.5px 1.5px ${color.border.strong}DA`}
        opacity={disabled ? 0.5 : 1}
        cursor={disabled ? 'not-allowed' : undefined}
        {...focusWithinRing(context === 'error' ? 'danger' : 'default')}
      >
        <Block
          component={rows > 1 ? 'textarea' : 'input'}
          padding={sizes[size]}
          width="100%"
          fontFamily="inherit"
          fontSize={fontSize}
          lineHeight={1.5}
          color={color.text.default}
          placeholderColor={color.text.muted}
          backgroundColor="transparent"
          borderColor="transparent"
          borderRadius={radius.sm}
          outline="none"
          resize="none"
          isolation="isolate"
          cursor={disabled ? 'not-allowed' : undefined}
          props={{
            id,
            name,
            autoFocus,
            disabled,
            placeholder,
            rows: rows > 1 ? rows : undefined,
            type,
            'aria-describedby': ariaDescribedBy,
            'aria-label': ariaLabel,
            'aria-labelledby': ariaLabelledBy,
            onKeyDown: preventKeyCapture,
            onKeyUp: preventKeyCapture,
            onKeyPress: preventKeyCapture,
            onBlur,
            onChange,
            ref: ref as any,
            ...restProps,
          }}
        />
      </Block>
    )
  }
)

Input.displayName = 'Input'
