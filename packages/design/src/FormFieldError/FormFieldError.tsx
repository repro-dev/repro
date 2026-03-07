import { Block } from '@jsxstyle/react'
import React from 'react'
import { color } from '../tokens/colors'
import { fontSize, fontWeight } from '../tokens/typography'

interface Props {
  /**
   * The field error to display. Only the `message` property is read.
   */
  error: { message?: string }
  /**
   * An optional id for this element.
   * Pass this id to the associated input's `aria-describedby` so screen readers
   * announce the error when the field receives focus.
   */
  id?: string
}

/**
 * Displays a field error message in danger-colored text.
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
      fontSize={fontSize.xs}
      fontWeight={fontWeight.normal}
      props={{ role: 'alert', 'aria-live': 'assertive' }}
    >
      {error.message}
    </Block>
  )
}
