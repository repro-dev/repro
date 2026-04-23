import { ResetPasswordForm } from '@repro/auth'
import { Card } from '@repro/design'
import { logger } from '@repro/logger'
import React, { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router'

const ResetPasswordRoute: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const onSuccess = useCallback(() => {
    logger.debug('password reset successful')
    navigate('/account/login')
  }, [navigate])

  const onFailure = useCallback((error: Error) => {
    logger.debug('password reset failed', error)
  }, [])

  if (!token) {
    return null
  }

  return (
    <Card>
      <ResetPasswordForm
        token={token}
        onSuccess={onSuccess}
        onFailure={onFailure}
      />
    </Card>
  )
}

export default ResetPasswordRoute
