import { zodResolver } from '@hookform/resolvers/zod'
import { Block, Col, Row } from '@jsxstyle/react'
import {
  Alert,
  Button,
  color,
  Divider,
  Link,
  spacing,
  Text,
  TextField,
} from '@repro/design'
import { isValidationError } from '@repro/validation'
import { fork } from 'fluture'
import { AlertCircleIcon, InfoIcon } from 'lucide-react'
import React, { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import z from 'zod'
import { GoogleSignInButton } from './GoogleSignInButton'
import { MfaPendingResponse } from './createState'
import { useLogin, useResetPassword, useVerifyTotp } from './hooks'

const loginFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const challengeSchema = z.object({
  code: z.string().min(1),
  backupCode: z.string().optional(),
})

const resetFormSchema = z.object({
  email: z.string().email(),
})

type LoginFormState = z.infer<typeof loginFormSchema>
type ChallengeFormState = z.infer<typeof challengeSchema>
type ResetFormState = z.infer<typeof resetFormSchema>

interface Props {
  redirectTo?: string
  registerHref?: string
  onSuccess(): void
  onFailure(error: Error): void
}

export const LoginForm: React.FC<Props> = ({
  onSuccess,
  onFailure,
  registerHref,
}) => {
  const [errorMessage, setErrorMessage] = useState('')
  const [showResetFlow, setShowResetFlow] = useState(false)
  const [showPostResetMessage, setShowPostResetMessage] = useState(false)
  const [showChallenge, setShowChallenge] = useState(false)
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [mfaPending, setMfaPending] = useState<string | null>(null)
  const [_loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const login = useLogin()
  const resetPassword = useResetPassword()
  const verifyTotp = useVerifyTotp()

  const methods = useForm({
    resolver: zodResolver(
      showChallenge
        ? challengeSchema
        : showResetFlow
        ? resetFormSchema
        : loginFormSchema
    ),
    defaultValues: {
      email: '',
      password: '',
      code: '',
      backupCode: '',
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
    })((value: any) => {
      // Check if MFA is required
      if (
        value != null &&
        typeof value === 'object' &&
        'mfa_pending' in value &&
        (value as MfaPendingResponse).totpRequired
      ) {
        setMfaPending(value.mfa_pending)
        setShowChallenge(true)
        setLoading(false)
        return
      }

      onSuccess()
      navigate('/')
    })(session)
  }

  function onChallenge(data: ChallengeFormState) {
    if (mfaPending == null) {
      return
    }

    const code = useBackupCode ? data.backupCode! : data.code
    const codeType = useBackupCode ? 'backup' : 'totp'

    setLoading(true)

    return fork((_err: Error) => {
      setErrorMessage(
        'Verification failed. The code may be incorrect, your authenticator app clock may be out of sync, or the challenge may have expired. Double-check the code in your authenticator app, ensure your device time is correct, or go back and sign in again to restart.'
      )
      setLoading(false)
    })(() => {
      onSuccess()
      navigate('/')
    })(verifyTotp(mfaPending, code, codeType))
  }

  function onSubmit(data: any) {
    setErrorMessage('')

    if (showChallenge) {
      onChallenge(data as ChallengeFormState)
    } else if (showResetFlow) {
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
              {showChallenge
                ? 'Two-factor authentication'
                : showResetFlow
                ? 'Reset password'
                : 'Log in'}
            </Text>

            <Text variant="bodySmall" color={color.text.muted}>
              {showChallenge
                ? useBackupCode
                  ? 'Enter one of your backup codes.'
                  : 'Enter the code from your authenticator app.'
                : showResetFlow
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

          {showChallenge ? (
            <>
              {!useBackupCode && (
                <TextField
                  label="Authentication code"
                  id="totp-code"
                  autoFocus
                  autoComplete="one-time-code"
                  invalid={!!formState.errors.code}
                  error={formState.errors.code}
                  {...register('code', { required: true })}
                />
              )}

              {useBackupCode && (
                <TextField
                  label="Backup code"
                  id="totp-backup-code"
                  autoFocus
                  invalid={!!formState.errors.backupCode}
                  error={formState.errors.backupCode}
                  {...register('backupCode', { required: true })}
                />
              )}

              <Button
                size="large"
                disabled={formState.isSubmitting}
                type="submit"
              >
                Verify
              </Button>

              <Block alignSelf="center">
                <Button
                  size="small"
                  type="button"
                  variant="text"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode)
                    setErrorMessage('')
                  }}
                >
                  {useBackupCode
                    ? 'Use authenticator code instead'
                    : 'Use a backup code instead'}
                </Button>
              </Block>

              <Block alignSelf="center">
                <Button
                  size="small"
                  type="button"
                  variant="text"
                  onClick={() => {
                    setShowChallenge(false)
                    setMfaPending(null)
                    setUseBackupCode(false)
                    setErrorMessage('')
                  }}
                >
                  Back to sign in
                </Button>
              </Block>
            </>
          ) : (
            <>
              <TextField
                label="Email"
                id="login-email"
                autoFocus
                autoComplete="email"
                invalid={!!formState.errors.email}
                error={formState.errors.email}
                {...register('email', { required: true })}
              />

              {!showResetFlow && (
                <TextField
                  label="Password"
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password', { required: true })}
                />
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

              <Button
                size="large"
                disabled={formState.isSubmitting}
                type="submit"
              >
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
                    size="large"
                    onClick={() => {
                      window.location.href = '/account/oauth/google'
                    }}
                  />

                  {registerHref && (
                    <Text variant="bodySmall" color={color.text.muted}>
                      Don&apos;t have an account?{' '}
                      <Link href={registerHref}>Sign up now</Link>
                    </Text>
                  )}
                </>
              )}
            </>
          )}
        </Col>
      </form>
    </FormProvider>
  )
}
