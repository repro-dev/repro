import { ApiClient } from '@repro/api-client'
import { createAtom } from '@repro/atom'
import type { StaffUser, User } from '@repro/domain'
import { tap, tapRej } from '@repro/future-utils'
import { FutureInstance, map } from 'fluture'

interface Config {
  apiClient: ApiClient
  // Base path for auth endpoints, e.g. '/account' (default) or '/staff'
  basePath?: string
  // Path to redirect to when a session is required but absent; defaults to `${basePath}/login`
  loginPath?: string
}

export type MfaPendingResponse = {
  mfa_pending: string
  totpRequired: true
}

export type LoginResult = User | StaffUser | MfaPendingResponse

export function createState(config: Config) {
  const { apiClient } = config
  const basePath = config.basePath ?? '/account'
  const loginPath = config.loginPath ?? `${basePath}/login`
  const [$session, setSession] = createAtom<User | StaffUser | null>(null)
  const [$sessionLoading, setSessionLoading] = createAtom(true)

  function isMfaPending(value: LoginResult): value is MfaPendingResponse {
    return (
      typeof value === 'object' &&
      value != null &&
      'mfa_pending' in value &&
      (value as MfaPendingResponse).totpRequired === true
    )
  }

  function login(email: string, password: string) {
    return apiClient
      .fetch<LoginResult>(`${basePath}/login`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      })
      .pipe(
        tap((result: LoginResult) => {
          if (!isMfaPending(result)) {
            setSession(result as User | StaffUser)
          }
          setSessionLoading(false)
        })
      )
  }

  function verifyTotp(
    mfaPending: string,
    code: string,
    codeType: 'totp' | 'backup' = 'totp'
  ): FutureInstance<Error, User | StaffUser> {
    return apiClient
      .fetch<User | StaffUser>(`${basePath}/totp/verify`, {
        method: 'POST',
        body: JSON.stringify({
          mfa_pending: mfaPending,
          code,
          codeType,
        }),
      })
      .pipe(
        tap((result: User | StaffUser) => {
          setSession(result)
        })
      )
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
      .fetch<{ account: { id: string }; user: User }>(`${basePath}/register`, {
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
    return apiClient
      .fetch<User>(`${basePath}/accept-invitation`, {
        method: 'POST',
        body: JSON.stringify({
          invitationToken,
          name,
          email,
          password,
        }),
      })
      .pipe(tap(setSession))
      .pipe(tap(() => setSessionLoading(false)))
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
    loginPath,
    login,
    logout,
    register,
    verify,
    verifyTotp,
    invite,
    acceptInvitation,
    resetPassword,
    confirmPasswordReset,
    loadSession,
  }
}
