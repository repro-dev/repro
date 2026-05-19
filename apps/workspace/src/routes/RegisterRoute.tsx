import { RegisterForm } from '@repro/auth'
import { logger } from '@repro/logger'
import React, { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'

const RegisterRoute: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const onSuccess = useCallback(() => {
    logger.debug('registration successful')
    const params = new URLSearchParams(location.search)
    const redirect = params.get('redirect')
    // Guard against open-redirect: only follow local paths
    const isLocalPath = redirect?.startsWith('/') && !redirect?.startsWith('//')
    navigate(isLocalPath && redirect ? redirect : '/')
  }, [location.search, navigate])

  const onFailure = useCallback((error: Error) => {
    logger.debug('registration failed', error)
  }, [])

  return <RegisterForm onSuccess={onSuccess} onFailure={onFailure} />
}

export default RegisterRoute
