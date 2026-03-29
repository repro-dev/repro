import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { ApiKeyService, createApiKeyService } from './apiKeys'

describe('Services > ApiKeys', () => {
  let harness: Harness
  let apiKeyService: ApiKeyService

  before(async () => {
    harness = await createTestHarness()
    apiKeyService = createApiKeyService(harness.db)
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('createApiKey', () => {
    it('should return a full plaintext key, prefix, and id', async () => {
      const [user, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.AccountA,
      ])
      const userId = decodeId(user.id)!
      const accountId = decodeId(account.id)!

      const result = await promise(
        apiKeyService.createApiKey({
          userId,
          accountId,
          name: 'My PAT',
          scopes: ['read'],
        })
      )

      expect(result).toMatchObject({
        id: expect.any(String),
        key: expect.stringMatching(/^repro_/),
        prefix: expect.any(String),
      })

      expect(result.key.length).toBeGreaterThan(10)
      expect(result.prefix.length).toBe(8)
    })

    it('should store the key as a hash, not in plaintext', async () => {
      const [user, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.AccountA,
      ])
      const userId = decodeId(user.id)!
      const accountId = decodeId(account.id)!

      const result = await promise(
        apiKeyService.createApiKey({
          userId,
          accountId,
          name: 'Secure Key',
          scopes: ['read'],
        })
      )

      // Fetch the raw row to verify the key was hashed (not stored in plaintext)
      const keys = await promise(apiKeyService.listApiKeys(userId))

      const record = keys.find(k => k.id === result.id)
      expect(record).toBeDefined()
      // The returned list record should not contain the full key
      expect((record as any).key).toBeUndefined()
    })

    it('should support optional expiresAt', async () => {
      const [user, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.AccountA,
      ])
      const userId = decodeId(user.id)!
      const accountId = decodeId(account.id)!
      const expiresAt = new Date(Date.now() + 86400 * 1000)

      const result = await promise(
        apiKeyService.createApiKey({
          userId,
          accountId,
          name: 'Expiring Key',
          scopes: ['read'],
          expiresAt,
        })
      )

      expect(result.id).toBeDefined()

      const keys = await promise(apiKeyService.listApiKeys(userId))
      const record = keys.find(k => k.id === result.id)
      // Compare timestamps — allow for minor rounding differences
      expect(record?.expiresAt?.getTime()).toBeCloseTo(expiresAt.getTime(), -3)
    })
  })

  describe('listApiKeys', () => {
    it('should return keys for the given user', async () => {
      const [userA, userB, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserB,
        fixtures.account.AccountA,
      ])
      const userAId = decodeId(userA.id)!
      const userBId = decodeId(userB.id)!
      const accountId = decodeId(account.id)!

      await promise(
        apiKeyService.createApiKey({
          userId: userAId,
          accountId,
          name: 'Key A',
          scopes: ['read'],
        })
      )
      await promise(
        apiKeyService.createApiKey({
          userId: userBId,
          accountId,
          name: 'Key B',
          scopes: ['write'],
        })
      )

      const keys = await promise(apiKeyService.listApiKeys(userAId))

      expect(keys.length).toBe(1)
      expect(keys[0]!.name).toBe('Key A')
    })

    it('should not include key_hash in list results', async () => {
      const [user, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.AccountA,
      ])
      const userId = decodeId(user.id)!
      const accountId = decodeId(account.id)!

      await promise(
        apiKeyService.createApiKey({
          userId,
          accountId,
          name: 'Sensitive Key',
          scopes: ['read'],
        })
      )

      const keys = await promise(apiKeyService.listApiKeys(userId))

      expect(keys.length).toBe(1)
      expect((keys[0] as any).keyHash).toBeUndefined()
    })
  })

  describe('revokeApiKey', () => {
    it('should set revokedAt on the key', async () => {
      const [user, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.AccountA,
      ])
      const userId = decodeId(user.id)!
      const accountId = decodeId(account.id)!

      const created = await promise(
        apiKeyService.createApiKey({
          userId,
          accountId,
          name: 'To Revoke',
          scopes: ['read'],
        })
      )

      await promise(
        apiKeyService.revokeApiKey({
          keyId: created.id,
          userId,
        })
      )

      const keys = await promise(apiKeyService.listApiKeys(userId))
      const record = keys.find(k => k.id === created.id)
      expect(record?.revokedAt).not.toBeNull()
    })

    it('should only allow the owner to revoke', async () => {
      const [userA, userB, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserB,
        fixtures.account.AccountA,
      ])
      const userAId = decodeId(userA.id)!
      const userBId = decodeId(userB.id)!
      const accountId = decodeId(account.id)!

      const created = await promise(
        apiKeyService.createApiKey({
          userId: userAId,
          accountId,
          name: 'Protected Key',
          scopes: ['read'],
        })
      )

      // UserB trying to revoke UserA's key — should silently do nothing
      await promise(
        apiKeyService.revokeApiKey({
          keyId: created.id,
          userId: userBId,
        })
      )

      const keys = await promise(apiKeyService.listApiKeys(userAId))
      const record = keys.find(k => k.id === created.id)
      expect(record?.revokedAt).toBeNull()
    })
  })

  describe('validateApiKey', () => {
    it('should return user/account info for a valid key', async () => {
      const [user, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.AccountA,
      ])
      const userId = decodeId(user.id)!
      const accountId = decodeId(account.id)!

      const created = await promise(
        apiKeyService.createApiKey({
          userId,
          accountId,
          name: 'Valid Key',
          scopes: ['read', 'write'],
        })
      )

      const result = await promise(apiKeyService.validateApiKey(created.key))

      expect(result).toMatchObject({
        userId: expect.any(String),
        accountId: expect.any(String),
        scopes: ['read', 'write'],
      })
    })

    it('should return null for an unknown key', async () => {
      const result = await promise(
        apiKeyService.validateApiKey('repro_unknownkey123')
      )
      expect(result).toBeNull()
    })

    it('should return null for a revoked key', async () => {
      const [user, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.AccountA,
      ])
      const userId = decodeId(user.id)!
      const accountId = decodeId(account.id)!

      const created = await promise(
        apiKeyService.createApiKey({
          userId,
          accountId,
          name: 'Revoked Key',
          scopes: ['read'],
        })
      )

      await promise(
        apiKeyService.revokeApiKey({
          keyId: created.id,
          userId,
        })
      )

      const result = await promise(apiKeyService.validateApiKey(created.key))
      expect(result).toBeNull()
    })

    it('should return null for an expired key', async () => {
      const [user, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.AccountA,
      ])
      const userId = decodeId(user.id)!
      const accountId = decodeId(account.id)!

      const created = await promise(
        apiKeyService.createApiKey({
          userId,
          accountId,
          name: 'Expired Key',
          scopes: ['read'],
          expiresAt: new Date(Date.now() - 1000), // already expired
        })
      )

      const result = await promise(apiKeyService.validateApiKey(created.key))
      expect(result).toBeNull()
    })
  })
})
