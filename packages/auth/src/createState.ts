import { ApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { Account, StaffUser, User } from '@repro/domain'
import { tap, tapRej } from '@repro/future-utils'
import { map } from 'fluture'

interface Config {
  apiClient: ApiClient
  // Base path for auth endpoints, e.g. '/account' (default) or '/staff'
  basePath?: string
}

export function createState(config: Config) {
  const { apiClient } = config
  const basePath = config.basePath ?? '/account'
  const [$session, setSession] = createAtom<User | StaffUser | null>(null)
  const [$sessionLoading, setSessionLoading] = createAtom(true)

  function login(email: string, password: string) {
    return apiClient
      .fetch<User | StaffUser>(`${basePath}/login`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      })
      .pipe(tap(setSession))
      .pipe(tap(() => setSessionLoading(false)))
  }

  function logout() {
    return apiClient
      .fetch(`${basePath}/logout`, { method: 'POST' })
      .pipe(tap(() => setSession(null)))
  }

  function register(
    accountName: string,
    userName: string,
    email: string,
    password: string
  ) {
    return apiClient
      .fetch<{ account: Account; user: User }>(`${basePath}/register`, {
        method: 'POST',
        body: JSON.stringify({
          accountName,
          userName,
          email,
          password,
        }),
      })
      .pipe(map(res => res.user))
      .pipe(tap(setSession))
      .pipe(tap(() => setSessionLoading(false)))
  }

  function verify(verificationToken: string, email: string) {
    return apiClient.fetch(`${basePath}/verify`, {
      method: 'POST',
      body: JSON.stringify({
        verificationToken,
        email,
      }),
    })
  }

  function resetPassword(email: string) {
    return apiClient.fetch(`${basePath}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  function confirmPasswordReset(token: string, newPassword: string) {
    return apiClient.fetch(`${basePath}/reset-password/confirm`, {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    })
  }

  function invite(email: string) {
    return apiClient.fetch(`${basePath}/invite`, {
      method: 'POST',
      body: JSON.stringify({
        email,
      }),
    })
  }

  function acceptInvitation(
    invitationToken: string,
    name: string,
    email: string,
    password: string
  ) {
    return apiClient.fetch(`${basePath}/accept-invitation`, {
      method: 'POST',
      body: JSON.stringify({
        invitationToken,
        name,
        email,
        password,
      }),
    })
  }

  function loadSession() {
    return apiClient
      .fetch<User | StaffUser>(`${basePath}/me`)
      .pipe(tap(setSession))
      .pipe(tap(() => setSessionLoading(false)))
      .pipe(tapRej(() => setSessionLoading(false)))
  }

  return {
    $session,
    $sessionLoading,
    login,
    logout,
    register,
    verify,
    invite,
    acceptInvitation,
    resetPassword,
    confirmPasswordReset,
    loadSession,
  }
}
