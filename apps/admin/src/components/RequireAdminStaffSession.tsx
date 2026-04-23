import {
  IfSession,
  useLoginPath,
  useSession,
  useSessionLoading,
} from '@repro/auth'
import React, { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'

/**
 * Guard for routes that require an admin staff session (isAdmin === true).
 * Redirects non-admin staff to / and unauthenticated users to /login.
 */
export const RequireAdminStaffSession: React.FC = () => {
  const navigate = useNavigate()
  const loginPath = useLoginPath()
  const session = useSession()
  const loading = useSessionLoading()

  useEffect(() => {
    if (!loading) {
      if (!session) {
        navigate(loginPath)
      } else if (session.type !== 'staff' || !session.isAdmin) {
        navigate('/')
      }
    }
  }, [loginPath, navigate, session, loading])

  return (
    <IfSession>
      <Outlet />
    </IfSession>
  )
}
