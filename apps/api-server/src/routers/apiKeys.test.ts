import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { ApiKeyService, createApiKeyService } from '~/services/apiKeys'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { createApiKeysRouter } from './apiKeys'

describe('Routers > ApiKeys', () => {
  let harness: Harness
  let apiKeyService: ApiKeyService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    apiKeyService = createApiKeyService(harness.db)
    app = harness.bootstrap(
      createApiKeysRouter(apiKeyService, harness.services.accountService)
    )
    await app.ready()
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('POST /api-keys', () => {
    it('should create an API key and return it once', async () => {
      const [_user, session] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/api-keys',
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
        body: {
          name: 'My Token',
          scopes: ['read'],
        },
      })

      expect(res.statusCode).toEqual(201)
      const body = res.json()
      expect(body).toMatchObject({
        id: expect.any(String),
        key: expect.stringMatching(/^repro_/),
        prefix: expect.any(String),
        name: 'My Token',
        scopes: ['read'],
        createdAt: expect.any(String),
      })
    })

    it('should return 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api-keys',
        body: {
          name: 'Unauthorized',
          scopes: ['read'],
        },
      })

      expect(res.statusCode).toEqual(401)
    })

    it('should support optional expiresAt', async () => {
      const [_user, session] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])

      const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString()

      const res = await app.inject({
        method: 'POST',
        url: '/api-keys',
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
        body: {
          name: 'Expiring Token',
          scopes: ['read'],
          expiresAt,
        },
      })

      expect(res.statusCode).toEqual(201)
    })
  })

  describe('GET /api-keys', () => {
    it('should list API keys for the current user', async () => {
      const [user, session, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
        fixtures.account.AccountA,
      ])

      const userId = decodeId(user.id)!
      const accountId = decodeId(account.id)!

      // Create a key directly via service
      await promise(
        apiKeyService.createApiKey({
          userId,
          accountId,
          name: 'Listed Key',
          scopes: ['read', 'write'],
        })
      )

      const res = await app.inject({
        method: 'GET',
        url: '/api-keys',
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            name: 'Listed Key',
            scopes: ['read', 'write'],
          }),
        ]),
      })

      // Full key must never be returned
      for (const item of body.items) {
        expect((item as any).key).toBeUndefined()
        expect((item as any).keyHash).toBeUndefined()
      }
    })

    it('should return 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api-keys',
      })

      expect(res.statusCode).toEqual(401)
    })
  })

  describe('DELETE /api-keys/:id', () => {
    it('should revoke the API key', async () => {
      const [user, session, account] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
        fixtures.account.AccountA,
      ])

      const userId = decodeId(user.id)!
      const accountId = decodeId(account.id)!

      const created = await promise(
        apiKeyService.createApiKey({
          userId,
          accountId,
          name: 'To Be Revoked',
          scopes: ['read'],
        })
      )

      const res = await app.inject({
        method: 'DELETE',
        url: `/api-keys/${created.id}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })

      expect(res.statusCode).toEqual(204)

      // Verify it's revoked
      const listRes = await app.inject({
        method: 'GET',
        url: '/api-keys',
        cookies: {
          [harness.env.SESSION_COOKIE]: app.signCookie(session.sessionToken),
        },
      })
      const keys = listRes.json().items
      const revoked = keys.find((k: any) => k.id === created.id)
      expect(revoked?.revokedAt).not.toBeNull()
    })

    it('should return 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api-keys/somekey123',
      })

      expect(res.statusCode).toEqual(401)
    })
  })
})
