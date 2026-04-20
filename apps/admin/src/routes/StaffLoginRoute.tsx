import { Block, Col, Row } from '@jsxstyle/react'
import { GoogleSignInButton, useLogin } from '@repro/auth'
import {
  Button,
  Card,
  color,
  colors,
  Divider,
  Input,
  Label,
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
    <Col width={360} alignItems="stretch" gap={12}>
      <Card>
        <form onSubmit={onSubmit}>
          <Col gap={16} alignItems="stretch">
            <Col gap={8}>
              <Block fontSize={15} fontWeight={700} color={color.primary}>
                Staff login
              </Block>

              <Block fontSize={13} lineHeight={1.5} color={color.text.muted}>
                Use your staff email and password, or continue with Google.
              </Block>
            </Col>

            {error === 'domain_not_allowed' && (
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
                Google sign-in is restricted to @repro.dev accounts. Use your
                staff email and password for local testing.
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

            <Col gap={8} alignItems="stretch">
              <Label htmlFor="staff-login-email">Email</Label>
              <Input
                id="staff-login-email"
                autoFocus={true}
                autoComplete="email"
                required={true}
                value={email}
                onChange={event => setEmail(event.currentTarget.value)}
              />
            </Col>

            <Col gap={8} alignItems="stretch">
              <Label htmlFor="staff-login-password">Password</Label>
              <Input
                id="staff-login-password"
                type="password"
                autoComplete="current-password"
                required={true}
                value={password}
                onChange={event => setPassword(event.currentTarget.value)}
              />
            </Col>

            <Button disabled={isSubmitting} type="submit">
              Log in
            </Button>

            <Row alignItems="center" gap={8}>
              <Divider spacing="none" />
              <Block flexShrink={0} fontSize={12} color={colors.slate['400']}>
                or
              </Block>
              <Divider spacing="none" />
            </Row>

            <GoogleSignInButton
              onClick={() => {
                window.location.href = `${env.REPRO_API_URL}/staff/oauth/google`
              }}
            />
          </Col>
        </form>
      </Card>
    </Col>
  )
}
