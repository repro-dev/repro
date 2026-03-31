import { GeneratedAlways } from 'kysely'

export interface ApiKeyTable {
  id: GeneratedAlways<number>
  // The user who owns this API key
  userId: number
  // The account associated with this key (nullable for legacy keys created via OAuth)
  accountId: number | null
  name: string
  // First 8 chars of the random portion, for display
  keyPrefix: string | null
  // SHA-256 hash of the full key for secure lookup
  keyHash: string | null
  scopes: string[]
  lastUsedAt: Date | null
  expiresAt: Date | null
  createdAt: GeneratedAlways<Date>
  revokedAt: Date | null
  // Legacy plain-token field (used by OAuth flow); new PATs use keyHash instead
  token: string
}
