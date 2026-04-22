import {
  IfSession,
  useLoginPath,
  useSession,
  useSessionLoading,
} from '@repro/auth'
import React, { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'

/**
 * Admin-specific session guard. Redirects to /login (not /account/login)
 * because admin authentication uses Google OAuth, not the user-facing form.
 * Used as a layout route element — renders <Outlet /> for nested child routes.
 */
export const RequireAdminSession: React.FC = () => {
  const navigate = useNavigate()
  const loginPath = useLoginPath()
  const session = useSession()
  const loading = useSessionLoading()

  useEffect(() => {
    if (!loading && !session) {
      navigate(loginPath)
    }
  }, [loginPath, navigate, session, loading])

  return (
    <IfSession>
      <Outlet />
    </IfSession>
  )
}
