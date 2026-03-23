import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId, encodeId } from '~/modules/database'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { notAuthenticated, notFound } from '~/utils/errors'
import { OAuthService, createOAuthService } from './oauth'

describe('Services > OAuth', () => {
  let harness: Harness
  let oauthService: OAuthService

  before(async () => {
    harness = await createTestHarness()
    oauthService = createOAuthService(harness.db)
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('createApiKey', () => {
    it('should create a key with correct fields', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const key = await promise(
        oauthService.createApiKey(userId, 'My API Key', ['recordings:read'])
      )

      expect(key).toMatchObject({
        id: expect.any(Number),
        token: expect.any(String),
        name: 'My API Key',
        userId,
        scopes: ['recordings:read'],
        lastUsedAt: null,
        createdAt: expect.any(Date),
        revokedAt: null,
      })

      expect(key.token.length).toBeGreaterThan(0)
    })
  })

  describe('validateApiKey', () => {
    it('should return the key for a valid token', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const created = await promise(
        oauthService.createApiKey(userId, 'Test Key', ['recordings:read'])
      )

      const validated = await promise(oauthService.validateApiKey(created.token))

      expect(validated).toMatchObject({
        id: created.id,
        token: created.token,
        name: 'Test Key',
      })
    })

    it('should return an error for a revoked key', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const created = await promise(
        oauthService.createApiKey(userId, 'Revokable Key', ['recordings:read'])
      )

      await promise(oauthService.revokeApiKey(created.id, userId))

      await expect(
        promise(oauthService.validateApiKey(created.token))
      ).rejects.toThrow(notAuthenticated())
    })

    it('should return not-found for an unknown token', async () => {
      await expect(
        promise(oauthService.validateApiKey('nonexistent-token'))
      ).rejects.toThrow(notFound())
    })
  })

  describe('revokeApiKey', () => {
    it('should mark the key as revoked', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const created = await promise(
        oauthService.createApiKey(userId, 'Revokable Key', ['recordings:read'])
      )

      await promise(oauthService.revokeApiKey(created.id, userId))

      const row = await harness.db
        .selectFrom('api_keys')
        .select('revokedAt')
        .where('id', '=', created.id)
        .executeTakeFirstOrThrow()

      expect(row.revokedAt).not.toBeNull()
    })
  })

  describe('listApiKeys', () => {
    it('should return all keys for a user', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      await promise(oauthService.createApiKey(userId, 'Key A', ['recordings:read']))
      await promise(oauthService.createApiKey(userId, 'Key B', ['recordings:write']))

      const keys = await promise(oauthService.listApiKeys(userId))

      expect(keys).toHaveLength(2)
      expect(keys.map(k => k.name).sort()).toEqual(['Key A', 'Key B'])
    })

    it('should return empty array when user has no keys', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const keys = await promise(oauthService.listApiKeys(userId))
      expect(keys).toEqual([])
    })
  })

  describe('registerClient', () => {
    it('should return encoded id and userId', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const client = await promise(
        oauthService.registerClient(userId, 'My Client', ['https://example.com/callback'])
      )

      expect(client.id).toEqual(expect.any(String))
      expect(client.userId).toEqual(expect.any(String))

      const decodedId = decodeId(client.id)
      const decodedUserId = decodeId(client.userId)

      expect(decodedId).toBeGreaterThan(0)
      expect(decodedUserId).toEqual(userId)
    })

    it('should encode id as valid Sqids string (not raw numeric string)', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const client = await promise(
        oauthService.registerClient(userId, 'Client', ['https://example.com/cb'])
      )

      expect(Number.isNaN(Number(client.id))).toBe(true)
      expect(Number.isNaN(Number(client.userId))).toBe(true)

      expect(client.id).toEqual(encodeId(decodeId(client.id)!))
      expect(client.userId).toEqual(encodeId(userId))
    })
  })

  describe('exchangeCode (PKCE)', () => {
    async function setupCode(userId: number) {
      const { createHash, randomBytes } = await import('node:crypto')
      const codeVerifier = randomBytes(32).toString('hex')
      const codeChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url')

      const client = await promise(
        oauthService.registerClient(userId, 'Test Client', ['https://example.com/callback'])
      )

      const code = await promise(
        oauthService.createAuthorizationCode(
          client.clientId,
          userId,
          'https://example.com/callback',
          codeChallenge,
          'S256',
          ['recordings:read']
        )
      )

      return { code, codeVerifier, clientId: client.clientId }
    }

    it('should validate PKCE correctly and return an API key on happy path', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const { code, codeVerifier, clientId } = await setupCode(userId)

      const apiKey = await promise(
        oauthService.exchangeCode(
          code,
          codeVerifier,
          clientId,
          'https://example.com/callback'
        )
      )

      expect(apiKey).toMatchObject({
        id: expect.any(Number),
        token: expect.any(String),
        userId,
        scopes: ['recordings:read'],
        revokedAt: null,
      })
    })

    it('should reject exchange with wrong code verifier', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const { code, clientId } = await setupCode(userId)

      await expect(
        promise(
          oauthService.exchangeCode(
            code,
            'wrong-verifier',
            clientId,
            'https://example.com/callback'
          )
        )
      ).rejects.toThrow(notAuthenticated())
    })

    it('should reject already-used codes (atomic single-use)', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const { code, codeVerifier, clientId } = await setupCode(userId)

      await promise(
        oauthService.exchangeCode(
          code,
          codeVerifier,
          clientId,
          'https://example.com/callback'
        )
      )

      await expect(
        promise(
          oauthService.exchangeCode(
            code,
            codeVerifier,
            clientId,
            'https://example.com/callback'
          )
        )
      ).rejects.toThrow(notAuthenticated())
    })

    it('should reject concurrent duplicate exchange attempts (race condition safety)', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const { code, codeVerifier, clientId } = await setupCode(userId)

      const results = await Promise.allSettled([
        promise(
          oauthService.exchangeCode(
            code,
            codeVerifier,
            clientId,
            'https://example.com/callback'
          )
        ),
        promise(
          oauthService.exchangeCode(
            code,
            codeVerifier,
            clientId,
            'https://example.com/callback'
          )
        ),
      ])

      const successes = results.filter(r => r.status === 'fulfilled')
      const failures = results.filter(r => r.status === 'rejected')

      expect(successes).toHaveLength(1)
      expect(failures).toHaveLength(1)
    })

    it('should reject mismatched clientId', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const { code, codeVerifier } = await setupCode(userId)

      await expect(
        promise(
          oauthService.exchangeCode(
            code,
            codeVerifier,
            'wrong-client-id',
            'https://example.com/callback'
          )
        )
      ).rejects.toThrow(notAuthenticated())
    })

    it('should reject mismatched redirectUri', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const { code, codeVerifier, clientId } = await setupCode(userId)

      await expect(
        promise(
          oauthService.exchangeCode(
            code,
            codeVerifier,
            clientId,
            'https://evil.com/callback'
          )
        )
      ).rejects.toThrow(notAuthenticated())
    })
  })
})
