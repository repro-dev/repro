import React, { PropsWithChildren, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { IfSession } from './IfSession'
import { useLoginPath, useSession, useSessionLoading } from './hooks'

export const RequireSession: React.FC<PropsWithChildren> = ({ children }) => {
  const navigate = useNavigate()
  const session = useSession()
  const loading = useSessionLoading()
  const loginPath = useLoginPath()

  useEffect(() => {
    if (!loading && !session) {
      navigate(loginPath)
    }
  }, [navigate, session, loading, loginPath])

  return <IfSession>{children}</IfSession>
}
