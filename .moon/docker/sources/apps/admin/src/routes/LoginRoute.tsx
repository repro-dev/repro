import { Col } from '@jsxstyle/react'
import { LoginForm } from '@repro/auth'
import { Card } from '@repro/design'
import { logger } from '@repro/logger'
import React, { useCallback } from 'react'
import { useNavigate } from 'react-router'

export const LoginRoute: React.FC = () => {
  const navigate = useNavigate()

  const onSuccess = useCallback(() => {
    logger.debug('login successful')
    navigate('/')
  }, [])

  const onFailure = useCallback((error: Error) => {
    logger.debug('login failed', error)
  }, [])

  return (
    <Col width={320} alignItems="stretch" gap={10}>
      <Card>
        <LoginForm onSuccess={onSuccess} onFailure={onFailure} />
      </Card>
    </Col>
  )
}
