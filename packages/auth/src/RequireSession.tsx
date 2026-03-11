import React, { PropsWithChildren, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { IfSession } from './IfSession'
import { useSession, useSessionLoading } from './hooks'

export const RequireSession: React.FC<PropsWithChildren> = ({ children }) => {
  const navigate = useNavigate()
  const session = useSession()
  const loading = useSessionLoading()

  useEffect(() => {
    if (!loading && !session) {
      navigate('/account/login')
    }
  }, [navigate, session, loading])

  return <IfSession>{children}</IfSession>
}
