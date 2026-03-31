import { zodResolver } from '@hookform/resolvers/zod'
import { Block, Col } from '@jsxstyle/react'
import {
  Button,
  colors,
  FormField,
  FormFieldError,
  Input,
  Label,
} from '@repro/design'
import { fork } from 'fluture'
import React, { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import z from 'zod'
import { useConfirmPasswordReset } from './hooks'

interface Props {
  token: string
  onSuccess(): void
  onFailure(error: Error): void
}

const formSchema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmedPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters'),
  })
  .refine(values => values.newPassword === values.confirmedPassword, {
    message: 'Passwords do not match',
    path: ['confirmedPassword'],
  })

type FormState = z.infer<typeof formSchema>

export const ResetPasswordForm: React.FC<Props> = ({
  token,
  onSuccess,
  onFailure,
}) => {
  const [errorMessage, setErrorMessage] = useState('')
  const confirmPasswordReset = useConfirmPasswordReset()

  const methods = useForm<FormState>({
    mode: 'onChange',
    resolver: zodResolver(formSchema),
    defaultValues: {
      newPassword: '',
      confirmedPassword: '',
    },
  })

  const { register, formState, handleSubmit } = methods

  function onSubmit(data: FormState) {
    return fork<Error>(err => {
      if (err.name === 'NotFoundError') {
        setErrorMessage(
          'This password reset link is invalid or has already been used.'
        )
      } else {
        setErrorMessage(
          'Unable to reset your password. Please request a new reset link.'
        )
      }
      onFailure(err)
    })(() => {
      onSuccess()
    })(confirmPasswordReset(token, data.newPassword))
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Col gap={16}>
          <Block fontSize={15} fontWeight={700} color={colors.blue['700']}>
            Set New Password
          </Block>

          <Block
            paddingBottom={10}
            fontSize={13}
            lineHeight="1.5em"
            borderBottom={`1px solid ${colors.slate['200']}`}
            color={colors.slate['500']}
          >
            Enter a new password for your account
          </Block>

          {errorMessage && (
            <Block
              alignSelf="stretch"
              padding={10}
              fontSize={13}
              lineHeight={1.5}
              backgroundColor={colors.rose['100']}
              color={colors.rose['700']}
              borderRadius={4}
              borderColor={colors.rose['300']}
              borderStyle="solid"
              borderWidth={1}
            >
              {errorMessage}
            </Block>
          )}

          <FormField>
            <Label htmlFor="reset-new-password">New password</Label>
            <Input
              id="reset-new-password"
              type="password"
              autoFocus={true}
              autoComplete="new-password"
              context={
                formState.errors.newPassword != null ? 'error' : 'normal'
              }
              aria-describedby={
                formState.errors.newPassword
                  ? 'reset-new-password-error'
                  : undefined
              }
              {...register('newPassword', { required: true })}
            />
            {formState.errors.newPassword && (
              <FormFieldError
                id="reset-new-password-error"
                error={formState.errors.newPassword}
              />
            )}
          </FormField>

          <FormField>
            <Label htmlFor="reset-confirm-password">Confirm new password</Label>
            <Input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              context={
                formState.errors.confirmedPassword != null ? 'error' : 'normal'
              }
              aria-describedby={
                formState.errors.confirmedPassword
                  ? 'reset-confirm-password-error'
                  : undefined
              }
              {...register('confirmedPassword', { required: true })}
            />
            {formState.errors.confirmedPassword && (
              <FormFieldError
                id="reset-confirm-password-error"
                error={formState.errors.confirmedPassword}
              />
            )}
          </FormField>

          <Button
            disabled={!formState.isValid || formState.isSubmitting}
            type="submit"
          >
            Set New Password
          </Button>
        </Col>
      </form>
    </FormProvider>
  )
}
