import { LoginForm } from '@repro/auth'
import { Card } from '@repro/design'
import { logger } from '@repro/logger'
import React, { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'

const LoginRoute: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const onSuccess = useCallback(() => {
    logger.debug('login successful')
    const params = new URLSearchParams(location.search)
    const redirect = params.get('redirect')
    // Guard against open-redirect: only follow local paths
    const isLocalPath = redirect?.startsWith('/') && !redirect?.startsWith('//')
    navigate(isLocalPath && redirect ? redirect : '/')
  }, [location.search, navigate])

  const onFailure = useCallback((error: Error) => {
    logger.debug('login failed', error)
  }, [])

  return (
    <Card>
      <LoginForm onSuccess={onSuccess} onFailure={onFailure} />
    </Card>
  )
}

export default LoginRoute
