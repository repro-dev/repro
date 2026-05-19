import { LoginForm } from '@repro/auth'
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

  return <LoginForm onSuccess={onSuccess} onFailure={onFailure} />
}
