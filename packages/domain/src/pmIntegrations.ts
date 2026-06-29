export type PmProvider = 'linear'

export type PmConnectionStatus = 'connected' | 'disconnected' | 'needs_reauth'

export interface PmOAuthProvider {
  createAuthorizationURL(state: string, scopes: string[]): URL
  validateAuthorizationCode(code: string): Promise<{
    accessToken(): string
    hasRefreshToken(): boolean
    refreshToken(): string
    accessTokenExpiresAt(): Date
    scopes(): string[]
  }>
  fetchWorkspaceInfo(accessToken: string): Promise<{ id: string; name: string }>
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken(): string
    hasRefreshToken(): boolean
    refreshToken(): string
    accessTokenExpiresAt(): Date
  }>
}

export type PmOAuthProviders = Record<string, PmOAuthProvider>

export interface PmConnection {
  id: string
  provider: PmProvider
  providerWorkspaceId: string
  scopes: string[]
  status: PmConnectionStatus
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}
