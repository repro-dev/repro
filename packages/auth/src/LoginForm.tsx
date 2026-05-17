import { zodResolver } from '@hookform/resolvers/zod'
import { Block, Col, Row } from '@jsxstyle/react'
import {
  Alert,
  Button,
  color,
  Divider,
  FormField,
  FormFieldError,
  Input,
  Label,
  spacing,
  Text,
} from '@repro/design'
import { isValidationError } from '@repro/validation'
import { fork } from 'fluture'
import { AlertCircleIcon, InfoIcon } from 'lucide-react'
import React, { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import z from 'zod'
import { GoogleSignInButton } from './GoogleSignInButton'
import { useLogin, useResetPassword } from './hooks'

const loginFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const resetFormSchema = z.object({
  email: z.string().email(),
})

type LoginFormState = z.infer<typeof loginFormSchema>
type ResetFormState = z.infer<typeof resetFormSchema>
type FormState = LoginFormState | ResetFormState

interface Props {
  redirectTo?: string
  onSuccess(): void
  onFailure(error: Error): void
}

export const LoginForm: React.FC<Props> = ({ onSuccess, onFailure }) => {
  const [errorMessage, setErrorMessage] = useState('')
  const [showResetFlow, setShowResetFlow] = useState(false)
  const [showPostResetMessage, setShowPostResetMessage] = useState(false)
  const [_loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const login = useLogin()
  const resetPassword = useResetPassword()

  const methods = useForm({
    resolver: zodResolver(showResetFlow ? resetFormSchema : loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const { register, formState, handleSubmit } = methods

  function onResetRequest(data: ResetFormState) {
    return fork(() => {
      setErrorMessage('Unable to send password reset email. Please try again.')
    })(() => {
      setShowPostResetMessage(true)
      setShowResetFlow(false)
    })(resetPassword(data.email))
  }

  function onLogin(data: LoginFormState) {
    setShowPostResetMessage(false)

    const session = login(data.email, data.password)

    setLoading(true)

    return fork((err: Error) => {
      if (err.name === 'TooManyRequests' || (err as any).statusCode === 429) {
        setErrorMessage('Too many login attempts. Please try again later.')
      } else if (
        isValidationError(err) ||
        err.name === 'NotAuthenticatedError'
      ) {
        setErrorMessage('Incorrect email or password')
      } else {
        setErrorMessage('Unable to log in. Please try again.')
      }

      setLoading(false)
      onFailure(err)
    })(() => {
      onSuccess()
      navigate('/')
    })(session)
  }

  function onSubmit(data: FormState) {
    if (showResetFlow) {
      onResetRequest(data as ResetFormState)
    } else {
      onLogin(data as LoginFormState)
    }
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Col gap={spacing.xl}>
          <Col gap={spacing.sm}>
            <Text variant="heading2" color={color.primary} as="h1">
              {showResetFlow ? 'Reset password' : 'Log in'}
            </Text>

            <Text variant="bodySmall" color={color.text.muted}>
              {showResetFlow
                ? 'Enter your email address to receive password reset instructions.'
                : 'Use your email and password to continue.'}
            </Text>
          </Col>

          {showPostResetMessage && (
            <Alert type="info" icon={<InfoIcon size={16} />}>
              Check your email for password reset instructions.
            </Alert>
          )}

          {errorMessage && (
            <Alert type="danger" icon={<AlertCircleIcon size={16} />}>
              {errorMessage}
            </Alert>
          )}

          <FormField>
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              autoFocus={true}
              autoComplete="email"
              context={formState.errors.email != null ? 'error' : 'normal'}
              aria-describedby={
                formState.errors.email ? 'login-email-error' : undefined
              }
              {...register('email', { required: true })}
            />
            {formState.errors.email && (
              <FormFieldError
                id="login-email-error"
                error={formState.errors.email}
              />
            )}
          </FormField>

          {!showResetFlow && (
            <FormField>
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                {...register('password', { required: true })}
              />
            </FormField>
          )}

          {!showResetFlow && (
            <Block alignSelf="flex-start">
              <Button
                size="small"
                type="button"
                variant="text"
                onClick={() => {
                  setShowResetFlow(true)
                  setShowPostResetMessage(false)
                  setErrorMessage('')
                }}
              >
                Forgot password?
              </Button>
            </Block>
          )}

          <Button disabled={formState.isSubmitting} type="submit">
            {showResetFlow ? 'Send reset email' : 'Log in'}
          </Button>

          {showResetFlow && (
            <Block alignSelf="center">
              <Button
                size="small"
                type="button"
                variant="text"
                onClick={() => {
                  setShowResetFlow(false)
                  setShowPostResetMessage(false)
                  setErrorMessage('')
                }}
              >
                Back to login
              </Button>
            </Block>
          )}

          {!showResetFlow && (
            <>
              <Row alignItems="center" gap={spacing.md}>
                <Divider spacing="none" />
                <Text variant="caption" color={color.text.muted}>
                  or
                </Text>
                <Divider spacing="none" />
              </Row>

              <GoogleSignInButton
                onClick={() => {
                  window.location.href = '/account/oauth/google'
                }}
              />
            </>
          )}
        </Col>
      </form>
    </FormProvider>
  )
}
