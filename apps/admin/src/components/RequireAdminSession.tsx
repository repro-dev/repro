import { IfSession, useSession, useSessionLoading } from '@repro/auth'
import React, { useEffect } from 'react'
import { useNavigate } from 'react-router'

/**
 * Admin-specific session guard. Redirects to /login (not /account/login)
 * because admin authentication uses Google OAuth, not the user-facing form.
 */
export const RequireAdminSession: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const navigate = useNavigate()
  const session = useSession()
  const loading = useSessionLoading()

  useEffect(() => {
    if (!loading && !session) {
      navigate('/login')
    }
  }, [navigate, session, loading])

  return <IfSession>{children}</IfSession>
}
