import { zodResolver } from '@hookform/resolvers/zod'
import { Col } from '@jsxstyle/react'
import {
  Alert,
  Button,
  color,
  FormField,
  FormFieldError,
  Input,
  Label,
  spacing,
  Text,
} from '@repro/design'
import { fork } from 'fluture'
import { AlertCircleIcon } from 'lucide-react'
import React, { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import z from 'zod'
import { useConfirmPasswordReset } from './hooks'

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

interface Props {
  token: string
  onSuccess(): void
  onFailure(error: Error): void
}

export const ResetPasswordForm: React.FC<Props> = ({
  token,
  onSuccess,
  onFailure,
}) => {
  const [errorMessage, setErrorMessage] = useState('')
  const confirmPasswordReset = useConfirmPasswordReset()

  const methods = useForm({
    mode: 'onChange',
    resolver: zodResolver(formSchema),
    defaultValues: {
      newPassword: '',
      confirmedPassword: '',
    },
  })

  const { register, formState, handleSubmit } = methods

  function onSubmit(data: FormState) {
    return fork((err: Error) => {
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
        <Col gap={spacing.xl}>
          <Col gap={spacing.sm}>
            <Text variant="heading2" color={color.primary} as="h1">
              Set new password
            </Text>

            <Text variant="bodySmall" color={color.text.muted}>
              Enter a new password for your account.
            </Text>
          </Col>

          {errorMessage && (
            <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
              {errorMessage}
            </Alert>
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
            Set new password
          </Button>
        </Col>
      </form>
    </FormProvider>
  )
}
