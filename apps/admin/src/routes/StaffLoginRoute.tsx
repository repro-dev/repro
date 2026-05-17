import { Col, Row } from '@jsxstyle/react'
import { GoogleSignInButton, useLogin } from '@repro/auth'
import {
  Alert,
  Button,
  color,
  Divider,
  FormField,
  Input,
  Label,
  spacing,
  Text,
} from '@repro/design'
import { fork } from 'fluture'
import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { defaultEnv as env } from '../config/env'

export const StaffLoginRoute: React.FC = () => {
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')
  const navigate = useNavigate()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setSubmitting(true)

    return fork((err: Error) => {
      if (err.name === 'NotAuthenticatedError') {
        setErrorMessage('Incorrect email or password')
      } else {
        setErrorMessage('Unable to log in. Please try again')
      }

      setSubmitting(false)
    })(() => {
      navigate('/')
    })(login(email, password))
  }

  return (
    <Col alignItems="stretch" gap={spacing['3xl']} width="100%">
      <Col gap={spacing.sm}>
        <Text variant="heading2" color={color.primary}>
          Staff login
        </Text>

        <Text variant="bodySmall" color={color.text.muted}>
          Use your staff email and password, or continue with Google.
        </Text>
      </Col>

      {error === 'domain_not_allowed' && (
        <Alert type="warning">
          <Text variant="bodySmall" color="currentColor">
            Google sign-in is restricted to @repro.dev accounts. Use your staff
            email and password for local testing.
          </Text>
        </Alert>
      )}

      {errorMessage && (
        <Alert type="danger">
          <Text variant="bodySmall" color="currentColor">
            {errorMessage}
          </Text>
        </Alert>
      )}

      <form onSubmit={onSubmit}>
        <Col gap={spacing['2xl']} alignItems="stretch">
          <FormField>
            <Label htmlFor="staff-login-email">Email</Label>
            <Input
              id="staff-login-email"
              autoFocus={true}
              autoComplete="email"
              context={errorMessage ? 'error' : 'normal'}
              required={true}
              value={email}
              onChange={event => setEmail(event.currentTarget.value)}
            />
          </FormField>

          <FormField>
            <Label htmlFor="staff-login-password">Password</Label>
            <Input
              id="staff-login-password"
              type="password"
              autoComplete="current-password"
              context={errorMessage ? 'error' : 'normal'}
              required={true}
              value={password}
              onChange={event => setPassword(event.currentTarget.value)}
            />
          </FormField>

          <Button size="large" disabled={isSubmitting} type="submit">
            Log in
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
              window.location.href = `${env.REPRO_API_URL}/staff/oauth/google`
            }}
          />
        </Col>
      </form>
    </Col>
  )
}
