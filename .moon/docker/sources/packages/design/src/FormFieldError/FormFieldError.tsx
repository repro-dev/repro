import { Block } from '@jsxstyle/react'
import React from 'react'
import { FieldError } from 'react-hook-form'
import { colors } from '../theme'

interface Props {
  error: FieldError
}

export const FormFieldError: React.FC<Props> = ({ error }) => {
  return (
    <Block color={colors.rose['500']} fontSize={12} fontWeight={700}>
      {error.message}
    </Block>
  )
}
