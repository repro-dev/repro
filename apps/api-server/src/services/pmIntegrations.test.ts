import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { Harness, createTestHarness } from '~/testing'

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
})
