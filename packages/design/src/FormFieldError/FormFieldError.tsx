import { Block } from '@jsxstyle/react'
import React from 'react'
import { FieldError } from 'react-hook-form'
import { color } from '../tokens/colors'

interface Props {
  /**
   * The react-hook-form field error to display.
   */
  error: FieldError
  /**
   * An optional id for this element.
   * Pass this id to the associated input's `aria-describedby` so screen readers
   * announce the error when the field receives focus.
   */
  id?: string
}

/**
 * Displays a react-hook-form `FieldError` message in danger-colored text.
 *
 * Use below a form field to show validation errors. Announces the error
 * to screen readers via `role="alert"` and `aria-live="assertive"`. Pass
 * `id` and link it to the input's `aria-describedby` for full accessibility.
 */
export const FormFieldError: React.FC<Props> = ({ error, id }) => {
  return (
    <Block
      id={id}
      color={color.danger}
      fontSize={12}
      fontWeight={400}
      props={{ role: 'alert', 'aria-live': 'assertive' }}
    >
      {error.message}
    </Block>
  )
}
