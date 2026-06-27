export type PmProvider = 'linear'

export type PmConnectionStatus = 'connected' | 'disconnected'

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
