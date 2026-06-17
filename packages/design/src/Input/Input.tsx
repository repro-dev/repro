/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing */
import { Block } from '@jsxstyle/react'
import type { MutableRefObject } from 'react'
import React, { forwardRef, useRef } from 'react'
import mergeRefs from 'react-merge-refs'
import { useFormFieldContext } from '../FormField/FormFieldContext'
import { color } from '../tokens/colors'
import { radius, shadow } from '../tokens/elevation'
import { formControlHeight } from '../tokens/formControl'
import { focusRing, focusWithinRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { MINIMUM_FONT_SIZE } from '../tokens/typography'

type Context = 'normal' | 'error'
type Size = 'small' | 'medium' | 'large'

export interface InputTrailingAction {
  /** Accessible name for the icon-only action. */
  label: string
  /** Icon or compact visual affordance shown inside the button. */
  icon: React.ReactNode
  onClick: React.MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
}

export interface InputProps {
  'aria-describedby'?: string
  'aria-invalid'?: boolean
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
  onClick?: React.MouseEventHandler<HTMLInputElement | HTMLTextAreaElement>
  pattern?: string
  placeholder?: string
  readOnly?: boolean
  required?: boolean
  rows?: number
  size?: Size
  trailingAction?: InputTrailingAction
  type?: string
  value?: string
}

const sizes = {
  small: 6,
  medium: 8,
  large: 10,
}

const INPUT_BORDER_WIDTH = 1

const trailingActionInsets = {
  small: spacing.sm,
  medium: spacing.sm,
  large: spacing.md,
} as const

/**
 * Form text input with error styling and configurable validation attributes.
 *
 * Renders a single-line `<input>` by default, or a `<textarea>` when
 * `rows` is greater than 1. Pair with an external `<Label htmlFor>` for
 * accessible labeling. Stops keyboard event propagation to prevent
 * conflicts with global shortcuts.
 *
 * When used inside a `FormField`, `id`, `aria-describedby`,
 * `aria-invalid`, `context`, and `disabled` are automatically provided
 * via context. Explicit props always override context values.
 *
 * `trailingAction` is reserved for reversible, field-local single-line
 * helpers such as clear, reveal, copy, or cancel draft edit. Use an adjacent
 * action row for persistence, destructive, or broader revert actions.
 */
export const Input = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InputProps
>(
  (
    {
      autoFocus = false,
      context: contextProp,
      disabled: disabledProp,
      placeholder = '',
      readOnly,
      rows = 1,
      size = 'medium',
      trailingAction,
      type = 'text',
      id: idProp,
      name,
      onBlur,
      onChange,
      onClick,
      value,
      'aria-describedby': ariaDescribedByProp,
      'aria-invalid': ariaInvalidProp,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      ...restProps
    },
    outerRef
  ) => {
    const fieldCtx = useFormFieldContext()

    const id = idProp ?? fieldCtx?.id
    const disabled = disabledProp ?? fieldCtx?.disabled ?? false
    const context = contextProp ?? (fieldCtx?.invalid ? 'error' : 'normal')
    const ariaInvalid =
      ariaInvalidProp ?? (fieldCtx?.invalid ? true : undefined)
    const ariaDescribedBy =
      ariaDescribedByProp ?? (fieldCtx?.invalid ? fieldCtx.errorId : undefined)

    const innerRef = useRef() as MutableRefObject<
      HTMLInputElement | HTMLTextAreaElement
    >
    const ref = mergeRefs([innerRef, outerRef])

    const base = sizes[size]
    const fontSize = Math.max(base * 1.5, MINIMUM_FONT_SIZE)
    const trailingActionInset = trailingActionInsets[size]
    const trailingActionSize =
      formControlHeight[size] - INPUT_BORDER_WIDTH * 2 - trailingActionInset * 2
    const shouldRenderTrailingAction = rows <= 1 && trailingAction

    if (process.env.NODE_ENV !== 'production') {
      if (!ariaLabel && !ariaLabelledBy && !id) {
        console.warn(
          'Input: No accessible label provided. Pass `aria-label`, `aria-labelledby`, or `id` (with a corresponding <Label htmlFor>) to ensure screen reader accessibility.'
        )
      }

      if (rows > 1 && trailingAction) {
        console.warn(
          'Input: `trailingAction` is only supported for single-line inputs. Use InputActionRow for textarea actions.'
        )
      }
    }

    function preventKeyCapture(evt: React.KeyboardEvent<HTMLElement>) {
      evt.stopPropagation()
    }

    return (
      <Block
        backgroundColor={color.bg.surface}
        borderColor={context === 'error' ? color.danger : color.border.strong}
        borderRadius={radius.sm}
        borderStyle="solid"
        borderWidth={1}
        boxShadow={shadow.xs}
        boxSizing="border-box"
        // Fixed height on single-line inputs; flex+center ensures the inner
        // <input> is vertically centered without relying on symmetric padding.
        display={rows > 1 ? undefined : 'flex'}
        alignItems={rows > 1 ? undefined : 'center'}
        height={rows > 1 ? undefined : formControlHeight[size]}
        opacity={disabled ? 0.5 : 1}
        cursor={disabled ? 'not-allowed' : undefined}
        transition={transition.fast}
        hoverBorderColor={
          disabled
            ? undefined
            : context === 'error'
            ? color.dangerHover
            : color.border.emphasis
        }
        {...focusWithinRing(context === 'error' ? 'danger' : 'default')}
      >
        <Block
          component={rows > 1 ? 'textarea' : 'input'}
          // Textarea keeps symmetric padding since it has no fixed height.
          // Single-line input uses horizontal-only padding; vertical centering
          // is handled by the flex wrapper above.
          padding={rows > 1 ? `${base}px ${base * 1.5}px` : undefined}
          paddingH={rows > 1 ? undefined : base * 1.5}
          flex={rows > 1 ? undefined : 1}
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
            readOnly,
            rows: rows > 1 ? rows : undefined,
            type,
            value,
            'aria-describedby': ariaDescribedBy,
            'aria-invalid': ariaInvalid,
            'aria-label': ariaLabel,
            'aria-labelledby': ariaLabelledBy,
            onKeyDown: preventKeyCapture,
            onKeyUp: preventKeyCapture,
            onKeyPress: preventKeyCapture,
            onBlur,
            onChange,
            onClick,
            ref: ref as any,
            ...restProps,
          }}
        />
        {shouldRenderTrailingAction ? (
          <Block
            component="button"
            flexShrink={0}
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            width={trailingActionSize}
            height={trailingActionSize}
            marginRight={trailingActionInset}
            border={0}
            borderRadius={radius.sm}
            backgroundColor="transparent"
            color={color.text.muted}
            hoverBackgroundColor={disabled ? undefined : color.bg.hover}
            hoverColor={disabled ? undefined : color.text.default}
            cursor={
              disabled || trailingAction.disabled ? 'not-allowed' : 'pointer'
            }
            opacity={disabled || trailingAction.disabled ? 0.5 : 1}
            transition={transition.fast}
            {...focusRing(context === 'error' ? 'danger' : 'default')}
            props={{
              type: 'button',
              'aria-label': trailingAction.label,
              title: trailingAction.label,
              disabled: disabled || trailingAction.disabled,
              onClick: trailingAction.onClick,
            }}
          >
            {trailingAction.icon}
          </Block>
        ) : null}
      </Block>
    )
  }
)

Input.displayName = 'Input'
