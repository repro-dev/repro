import { PmOAuthProviders } from '@repro/domain'
import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { createPmIntegrationService } from '~/services/pmIntegrations'
import { Harness, createTestHarness } from '~/testing'

function createTestProviders(): {
  providers: PmOAuthProviders
  getRefreshCallCount: () => number
  setRefreshShouldFail: (shouldFail: boolean) => void
  getLastRefreshToken: () => string | null
} {
  let refreshCallCount = 0
  let refreshShouldFail = false
  let lastRefreshToken: string | null = null

  const provider = {
    createAuthorizationURL(_state: string, _scopes: string[]): URL {
      return new URL('https://linear.app/oauth/authorize')
    },
    validateAuthorizationCode: async (_code: string) => ({
      accessToken: () => 'test-access-token',
      hasRefreshToken: () => true,
      refreshToken: () => 'test-refresh-token',
      accessTokenExpiresAt: () => new Date(Date.now() + 3600_000),
      scopes: () => ['read'],
    }),
    fetchWorkspaceInfo: async (_accessToken: string) => ({
      id: 'wrkspc-1',
      name: 'Test Workspace',
    }),
    refreshAccessToken: async (refreshToken: string) => {
      refreshCallCount++
      lastRefreshToken = refreshToken

      if (refreshShouldFail) {
        throw new Error('Simulated refresh failure')
      }

      return {
        accessToken: () => 'new-access-token-' + refreshCallCount,
        hasRefreshToken: () => true,
        refreshToken: () => 'rotated-refresh-token-' + refreshCallCount,
        accessTokenExpiresAt: () => new Date(Date.now() + 3600_000),
      }
    },
  }

  return {
    providers: { linear: provider },
    getRefreshCallCount: () => refreshCallCount,
    setRefreshShouldFail: (fail: boolean) => {
      refreshShouldFail = fail
    },
    getLastRefreshToken: () => lastRefreshToken,
  }
}

describe('Services > PmIntegrationService', () => {
  let harness: Harness
  let accountId: number

  before(async () => {
    harness = await createTestHarness()
  })

  beforeEach(async () => {
    await harness.reset()

    // Create a fresh account for each test to satisfy the FK constraint
    const account = await promise(
      harness.services.accountService.createAccount('Test Account')
    )
    accountId = decodeId(account.id)!
  })

  after(async () => {
    await harness.close()
  })

  describe('upsertConnection', () => {
    it('should create a new connection', async () => {
      const conn = await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'test-access-token',
          refreshToken: null,
          expiresAt: null,
          scopes: ['read', 'issues:read'],
          status: 'connected',
        })
      )

      expect(conn.id).toBeGreaterThan(0)
      expect(conn.accountId).toBe(accountId)
      expect(conn.provider).toBe('linear')
      expect(conn.accessToken).toBe('test-access-token')
      expect(conn.scopes).toEqual(['read', 'issues:read'])
      expect(conn.status).toBe('connected')
    })

    it('should update an existing connection on conflict', async () => {
      // Create first
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'original-token',
          refreshToken: null,
          expiresAt: null,
          scopes: ['read'],
          status: 'connected',
        })
      )

      // Upsert with same accountId + provider — should update
      const updated = await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'updated-token',
          refreshToken: 'refresh-token-123',
          expiresAt: null,
          scopes: ['read', 'issues:read'],
          status: 'connected',
        })
      )

      expect(updated.accessToken).toBe('updated-token')
      expect(updated.refreshToken).toBe('refresh-token-123')
      expect(updated.scopes).toEqual(['read', 'issues:read'])
    })
  })

  describe('getConnection', () => {
    it('should return a connection by accountId and provider', async () => {
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'test-token',
          refreshToken: null,
          expiresAt: null,
          scopes: ['read'],
          status: 'connected',
        })
      )

      const result = await promise(
        harness.services.pmIntegrationService.getConnection(accountId, 'linear')
      )

      expect(result).toBeDefined()
      expect(result.provider).toBe('linear')
      expect(result.accessToken).toBe('test-token')
    })

    it('should reject with not found for missing connection', async () => {
      await expect(
        promise(
          harness.services.pmIntegrationService.getConnection(999, 'linear')
        )
      ).rejects.toThrow()
    })
  })

  describe('disconnectConnection', () => {
    it('should set status to disconnected and clear tokens', async () => {
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'test-token',
          refreshToken: 'refresh-token',
          expiresAt: null,
          scopes: ['read'],
          status: 'connected',
        })
      )

      const result = await promise(
        harness.services.pmIntegrationService.disconnectConnection(
          accountId,
          'linear'
        )
      )

      expect(result).toBeDefined()
      expect(result!.status).toBe('disconnected')
      expect(result!.accessToken).toBe('')
      expect(result!.refreshToken).toBe('')
    })

    it('should be a no-op when not connected', async () => {
      const result = await promise(
        harness.services.pmIntegrationService.disconnectConnection(
          accountId,
          'linear'
        )
      )

      expect(result).toBeUndefined()
    })
  })

  describe('listConnections', () => {
    it('should return all connections for an account', async () => {
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'token-1',
          refreshToken: null,
          expiresAt: null,
          scopes: ['read'],
          status: 'connected',
        })
      )

      const rows = await promise(
        harness.services.pmIntegrationService.listConnections(accountId)
      )

      expect(rows.length).toBe(1)
      expect(rows[0]!.provider).toBe('linear')
    })

    it('should return empty array when no connections exist', async () => {
      const rows = await promise(
        harness.services.pmIntegrationService.listConnections(999)
      )

      expect(rows).toEqual([])
    })
  })

  describe('getValidAccessToken', () => {
    it('should return the stored token when it is still fresh', async () => {
      const testProviders = createTestProviders()
      const pmService = createPmIntegrationService(
        harness.db,
        testProviders.providers
      )

      // Create a connection with expiresAt far in the future
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'fresh-token',
          refreshToken: 'some-refresh-token',
          expiresAt: new Date(Date.now() + 3600_000), // 1 hour in the future
          scopes: ['read'],
          status: 'connected',
        })
      )

      const token = await promise(
        pmService.getValidAccessToken(accountId, 'linear')
      )

      expect(token).toBe('fresh-token')
      expect(testProviders.getRefreshCallCount()).toBe(0)
    })

    it('should refresh and persist a new token when stale', async () => {
      const testProviders = createTestProviders()
      const pmService = createPmIntegrationService(
        harness.db,
        testProviders.providers
      )

      // Create a connection with expiresAt in the past
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'stale-token',
          refreshToken: 'existing-refresh-token',
          expiresAt: new Date(Date.now() - 3600_000), // 1 hour in the past
          scopes: ['read'],
          status: 'connected',
        })
      )

      const token = await promise(
        pmService.getValidAccessToken(accountId, 'linear')
      )

      // Should return the new access token
      expect(token).toBe('new-access-token-1')
      expect(testProviders.getRefreshCallCount()).toBe(1)

      // Verify the DB was updated atomically
      const connection = await promise(
        harness.services.pmIntegrationService.getConnection(accountId, 'linear')
      )
      expect(connection.accessToken).toBe('new-access-token-1')
      expect(connection.expiresAt!.getTime()).toBeGreaterThan(Date.now())
    })

    it('should persist rotated refresh token when provider returns a new one', async () => {
      const testProviders = createTestProviders()
      const pmService = createPmIntegrationService(
        harness.db,
        testProviders.providers
      )

      // Create a connection with a known refresh token
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'stale-token',
          refreshToken: 'original-refresh-token',
          expiresAt: new Date(Date.now() - 3600_000),
          scopes: ['read'],
          status: 'connected',
        })
      )

      await promise(pmService.getValidAccessToken(accountId, 'linear'))

      // Verify the refresh token was rotated in the DB
      const connection = await promise(
        harness.services.pmIntegrationService.getConnection(accountId, 'linear')
      )
      expect(connection.refreshToken).toBe('rotated-refresh-token-1')
    })

    it('should single-flight concurrent refresh calls', async () => {
      const testProviders = createTestProviders()
      const pmService = createPmIntegrationService(
        harness.db,
        testProviders.providers
      )

      // Create a stale connection
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'stale-token',
          refreshToken: 'existing-refresh-token',
          expiresAt: new Date(Date.now() - 3600_000),
          scopes: ['read'],
          status: 'connected',
        })
      )

      // Launch two concurrent calls
      const [token1, token2] = await Promise.all([
        promise(pmService.getValidAccessToken(accountId, 'linear')),
        promise(pmService.getValidAccessToken(accountId, 'linear')),
      ])

      // Both should return the same new access token
      expect(token1).toBe(token2)

      // Only one refresh should have been made
      expect(testProviders.getRefreshCallCount()).toBe(1)
    })

    it('should mark connection as needs_reauth and reject on refresh failure', async () => {
      const testProviders = createTestProviders()
      testProviders.setRefreshShouldFail(true)
      const pmService = createPmIntegrationService(
        harness.db,
        testProviders.providers
      )

      // Create a stale connection
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'stale-token',
          refreshToken: 'existing-refresh-token',
          expiresAt: new Date(Date.now() - 3600_000),
          scopes: ['read'],
          status: 'connected',
        })
      )

      await expect(
        promise(pmService.getValidAccessToken(accountId, 'linear'))
      ).rejects.toThrow('Token refresh failed; re-authorization required')

      // Verify the connection was marked as needs_reauth
      const connection = await promise(
        harness.services.pmIntegrationService.getConnection(accountId, 'linear')
      )
      expect(connection.status).toBe('needs_reauth')
    })

    it('should resolve with current token when refreshToken is null and token is fresh', async () => {
      const testProviders = createTestProviders()
      const pmService = createPmIntegrationService(
        harness.db,
        testProviders.providers
      )

      // Create a connection with no refresh token but a fresh expiry
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'no-refresh-token',
          refreshToken: null,
          expiresAt: new Date(Date.now() + 3600_000), // still fresh
          scopes: ['read'],
          status: 'connected',
        })
      )

      const token = await promise(
        pmService.getValidAccessToken(accountId, 'linear')
      )

      expect(token).toBe('no-refresh-token')
      expect(testProviders.getRefreshCallCount()).toBe(0)
    })

    it('should reject when refreshToken is null and token is stale', async () => {
      const testProviders = createTestProviders()
      const pmService = createPmIntegrationService(
        harness.db,
        testProviders.providers
      )

      // Create a connection with no refresh token and stale expiry
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'stale-no-refresh',
          refreshToken: null,
          expiresAt: new Date(Date.now() - 3600_000), // expired
          scopes: ['read'],
          status: 'connected',
        })
      )

      await expect(
        promise(pmService.getValidAccessToken(accountId, 'linear'))
      ).rejects.toThrow('Token refresh failed; re-authorization required')
    })

    it('should reject immediately without refresh when connection is already needs_reauth', async () => {
      const testProviders = createTestProviders()
      const pmService = createPmIntegrationService(
        harness.db,
        testProviders.providers
      )

      // Create a connection already in needs_reauth status
      await promise(
        harness.services.pmIntegrationService.upsertConnection({
          accountId,
          provider: 'linear',
          providerWorkspaceId: 'wrkspc-1',
          accessToken: 'already-failed-token',
          refreshToken: 'some-refresh-token',
          expiresAt: new Date(Date.now() - 3600_000), // expired, but irrelevant
          scopes: ['read'],
          status: 'needs_reauth',
        })
      )

      await expect(
        promise(pmService.getValidAccessToken(accountId, 'linear'))
      ).rejects.toThrow('Token refresh failed; re-authorization required')

      // No refresh should have been attempted
      expect(testProviders.getRefreshCallCount()).toBe(0)
    })
  })
})
