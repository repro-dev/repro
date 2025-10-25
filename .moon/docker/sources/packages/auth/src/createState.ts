import { ApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import { StaffUser, User } from '@repro/domain'
import { tap } from '@repro/future-utils'

interface Config {
  apiClient: ApiClient
}

export function createState(config: Config) {
  const { apiClient } = config
  const [$session, setSession] = createAtom<User | StaffUser | null>(null)

  function login(email: string, password: string) {
    return apiClient
      .fetch<User | StaffUser>('/account/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      })
      .pipe(tap(setSession))
  }

  function logout() {
    return apiClient
      .fetch('/account/logout', { method: 'POST' })
      .pipe(tap(() => setSession(null)))
  }

  function register(
    accountName: string,
    userName: string,
    email: string,
    password: string
  ) {
    return apiClient.fetch('/account/register', {
      method: 'POST',
      body: JSON.stringify({
        accountName,
        userName,
        email,
        password,
      }),
    })
  }

  function verify(verificationToken: string, email: string) {
    return apiClient.fetch('/account/verify', {
      method: 'POST',
      body: JSON.stringify({
        verificationToken,
        email,
      }),
    })
  }

  function resetPassword(email: string) {
    return apiClient.fetch('/account/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  function invite(email: string) {
    return apiClient.fetch('/account/invite', {
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
    return apiClient.fetch('/account/accept-invitation', {
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
      .fetch<User | StaffUser>('/account/me')
      .pipe(tap(setSession))
  }

  return {
    $session,
    login,
    logout,
    register,
    verify,
    invite,
    acceptInvitation,
    resetPassword,
    loadSession,
  }
}
