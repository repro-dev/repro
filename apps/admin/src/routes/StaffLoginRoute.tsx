import { Col } from '@jsxstyle/react'
import { GoogleSignInButton } from '@repro/auth'
import { Card } from '@repro/design'
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
            <p
              style={{
                margin: 0,
                padding: '10px',
                fontSize: '13px',
                lineHeight: 1.5,
                backgroundColor: '#ffe4e6',
                color: '#9f1239',
                borderRadius: '4px',
                border: '1px solid #fca5a5',
              }}
            >
              Access restricted to @repro.dev accounts. Please sign in with your
              Repro Google account.
            </p>
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
