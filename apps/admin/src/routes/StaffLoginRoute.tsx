import { Block, Col } from '@jsxstyle/react'
import { GoogleSignInButton } from '@repro/auth'
import { Card, colors } from '@repro/design'
import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { defaultEnv as env } from '../config/env'

export const StaffLoginRoute: React.FC = () => {
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')

  return (
    <Col width={320} alignItems="stretch" gap={10}>
      <Card>
        <Col gap={16} alignItems="stretch">
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
              Access restricted to @repro.dev accounts. Please sign in with your
              Repro Google account.
            </Block>
          )}

          <GoogleSignInButton
            onClick={() => {
              window.location.href = `${env.REPRO_API_URL}/staff/oauth/google`
            }}
          />
        </Col>
      </Card>
    </Col>
  )
}
