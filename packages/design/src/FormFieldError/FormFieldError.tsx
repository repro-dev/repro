import { Block } from '@jsxstyle/react'
import React from 'react'
import { FieldError } from 'react-hook-form'
import { colors } from '../theme'

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

export const FormFieldError: React.FC<Props> = ({ error, id }) => {
  return (
    <Block
      id={id}
      color={colors.rose['500']}
      fontSize={12}
      fontWeight={700}
      props={{ role: 'alert', 'aria-live': 'assertive' }}
    >
      {error.message}
    </Block>
  )
}
