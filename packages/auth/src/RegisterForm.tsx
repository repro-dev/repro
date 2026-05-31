import { zodResolver } from '@hookform/resolvers/zod'
import { Col, Row } from '@jsxstyle/react'
import {
  Alert,
  Button,
  color,
  Divider,
  spacing,
  Text,
  TextField,
} from '@repro/design'
import { isValidationError } from '@repro/validation'
import { done } from 'fluture'
import { AlertCircleIcon } from 'lucide-react'
import React, { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import z from 'zod'
import { GoogleSignInButton } from './GoogleSignInButton'
import { useRegister } from './hooks'

const formSchema = z
  .object({
    accountName: z.string(),
    userName: z.string(),
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmedPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters'),
  })
  .refine(values => values.password === values.confirmedPassword, {
    message: 'Passwords do not match',
    path: ['confirmedPassword'],
  })

type FormState = z.infer<typeof formSchema>

interface Props {
  onSuccess(): void
  onFailure(error: Error): void
}

export const RegisterForm: React.FC<Props> = ({ onSuccess, onFailure }) => {
  const [errorMessage, setErrorMessage] = useState('')

  // const navigate = useNavigate()
  const registerAccount = useRegister()

  const methods = useForm({
    mode: 'onChange',
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountName: '',
      userName: '',
      email: '',
      password: '',
      confirmedPassword: '',
    },
  })

  const { register, formState, handleSubmit } = methods

  function onSubmit(data: FormState) {
    const registration = registerAccount(
      data.accountName,
      data.userName,
      data.email,
      data.password
    )

    registration.pipe(
      done(error => {
        if (error) {
          if (
            error.name === 'TooManyRequests' ||
            (error as any).statusCode === 429
          ) {
            setErrorMessage(
              'Too many registration attempts. Please try again later.'
            )
          } else if (isValidationError(error)) {
            setErrorMessage(`Form invalid: ${error.message}`)
          } else if (error.name === 'ResourceConflictError') {
            setErrorMessage('User already exists for this email address.')
          } else {
            setErrorMessage('Unable to register account. Please try again.')
          }

          onFailure(error)
        } else {
          onSuccess()
        }
      })
    )
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Col gap={spacing.xl}>
          <Col gap={spacing.sm}>
            <Text variant="heading2" color={color.primary} as="h1">
              Create account
            </Text>

            <Text variant="bodySmall" color={color.text.muted}>
              Create a new Repro account.
            </Text>
          </Col>

          {errorMessage && (
            <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
              {errorMessage}
            </Alert>
          )}

          <TextField
            label="Company"
            id="reg-account"
            autoFocus
            invalid={!!formState.errors.accountName}
            {...register('accountName', { required: true })}
          />

          <TextField
            label="Your name"
            id="reg-name"
            invalid={!!formState.errors.userName}
            {...register('userName', { required: true })}
          />

          <TextField
            label="Email"
            id="reg-email"
            autoComplete="email"
            invalid={!!formState.errors.email}
            {...register('email', { required: true })}
          />

          <TextField
            label="Password"
            id="reg-password"
            type="password"
            autoComplete="new-password"
            {...register('password', { required: true })}
          />

          <TextField
            label="Confirm password"
            id="reg-confirm-password"
            type="password"
            autoComplete="new-password"
            {...register('confirmedPassword', { required: true })}
          />

          <Button
            size="large"
            disabled={!formState.isValid || formState.isSubmitting}
            type="submit"
          >
            Create account
          </Button>

          <Row alignItems="center" gap={spacing.md}>
            <Divider spacing="none" />
            <Text variant="caption" color={color.text.muted}>
              or
            </Text>
            <Divider spacing="none" />
          </Row>

          <GoogleSignInButton
            size="large"
            onClick={() => {
              window.location.href = '/account/oauth/google'
            }}
          />
        </Col>
      </form>
    </FormProvider>
  )
}
