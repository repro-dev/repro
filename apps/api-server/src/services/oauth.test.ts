import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
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

  describe('exchangeCode (PKCE)', () => {
    it('should validate PKCE correctly and return an API key on happy path', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const { createHash, randomBytes } = await import('node:crypto')
      const codeVerifier = randomBytes(32).toString('hex')
      const codeChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url')

      const clientId = randomBytes(16).toString('hex')

      const code = await promise(
        oauthService.createAuthorizationCode(
          clientId,
          userId,
          'https://example.com/callback',
          codeChallenge,
          'S256',
          ['recordings:read']
        )
      )

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

      const { createHash, randomBytes } = await import('node:crypto')
      const codeVerifier = randomBytes(32).toString('hex')
      const codeChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url')

      const clientId = randomBytes(16).toString('hex')

      const code = await promise(
        oauthService.createAuthorizationCode(
          clientId,
          userId,
          'https://example.com/callback',
          codeChallenge,
          'S256',
          ['recordings:read']
        )
      )

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

    it('should reject already-used codes', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const { createHash, randomBytes } = await import('node:crypto')
      const codeVerifier = randomBytes(32).toString('hex')
      const codeChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url')

      const clientId = randomBytes(16).toString('hex')

      const code = await promise(
        oauthService.createAuthorizationCode(
          clientId,
          userId,
          'https://example.com/callback',
          codeChallenge,
          'S256',
          ['recordings:read']
        )
      )

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
  })
})
