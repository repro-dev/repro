import { zodResolver } from '@hookform/resolvers/zod'
import { Block, Col, Row } from '@jsxstyle/react'
import {
  Button,
  color,
  colors,
  Divider,
  FormField,
  FormFieldError,
  Input,
  Label,
  Link,
} from '@repro/design'
import { isValidationError } from '@repro/validation'
import { fork } from 'fluture'
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
      setErrorMessage(
        'Unable to complete password reset request. Please try again'
      )
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
        setErrorMessage('Unable to log in. Please try again')
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
        <Col gap={16}>
          <Col gap={12}>
            <Block fontSize={15} fontWeight={700} color={color.primary}>
              {showResetFlow ? 'Reset Your Password' : 'Log In'}
            </Block>

            <Block
              paddingBottom={10}
              fontSize={13}
              lineHeight="1.5em"
              borderBottom={`1px solid ${color.border.default}`}
              color={color.text.muted}
            >
              {showResetFlow
                ? 'Enter your email for password reset instructions'
                : null}
            </Block>
          </Col>

          {showPostResetMessage && (
            <Block
              alignSelf="stretch"
              padding={10}
              fontSize={13}
              lineHeight={1.5}
              backgroundColor={color.primarySubtle}
              color={color.primary}
              borderRadius={4}
              borderColor={colors.blue['300']}
              borderStyle="solid"
              borderWidth={1}
            >
              Please check your email for instructions to reset your password.
            </Block>
          )}

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
            <Block>
              <Link
                component="button"
                props={{
                  type: 'button',
                  // Reset native browser button styles so the link renders as
                  // inline text with no button chrome (background, border, padding).
                  style: {
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    font: 'inherit',
                    cursor: 'pointer',
                  },
                  onClick: () => {
                    setShowResetFlow(true)
                    setShowPostResetMessage(false)
                    setErrorMessage('')
                  },
                }}
              >
                Forgot password?
              </Link>
            </Block>
          )}

          <Button disabled={formState.isSubmitting} type="submit">
            {showResetFlow ? 'Send Reset Email' : 'Log In'}
          </Button>

          {showResetFlow && (
            <Block alignSelf="center">
              <Button
                variant="text"
                size="small"
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
              <Row alignItems="center" gap={8}>
                <Divider spacing="none" />
                <Block flexShrink={0} fontSize={12} color={colors.slate['400']}>
                  or
                </Block>
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
