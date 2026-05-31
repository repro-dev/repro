import { zodResolver } from '@hookform/resolvers/zod'
import { Col } from '@jsxstyle/react'
import { Alert, Button, color, spacing, Text, TextField } from '@repro/design'
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

          <TextField
            label="New password"
            id="reset-new-password"
            type="password"
            autoFocus
            autoComplete="new-password"
            invalid={!!formState.errors.newPassword}
            error={formState.errors.newPassword}
            {...register('newPassword', { required: true })}
          />

          <TextField
            label="Confirm new password"
            id="reset-confirm-password"
            type="password"
            autoComplete="new-password"
            invalid={!!formState.errors.confirmedPassword}
            error={formState.errors.confirmedPassword}
            {...register('confirmedPassword', { required: true })}
          />

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
