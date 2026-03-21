import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { OAuthService, createOAuthService } from '~/services/oauth'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { createOAuthRouter } from './oauth'

describe('Routers > OAuth', () => {
  let harness: Harness
  let oauthService: OAuthService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    oauthService = createOAuthService(harness.db)
    app = harness.bootstrap(
      createOAuthRouter(oauthService, harness.services.accountService)
    )
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('POST /token', () => {
    it('should return access_token on successful code exchange', async () => {
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

      const res = await app.inject({
        method: 'POST',
        url: '/token',
        body: {
          grant_type: 'authorization_code',
          code,
          code_verifier: codeVerifier,
          client_id: clientId,
          redirect_uri: 'https://example.com/callback',
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({
        access_token: expect.any(String),
        token_type: 'Bearer',
        scope: 'recordings:read',
      })
    })

    it('should return 401 for wrong code verifier', async () => {
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

      const res = await app.inject({
        method: 'POST',
        url: '/token',
        body: {
          grant_type: 'authorization_code',
          code,
          code_verifier: 'wrong-verifier',
          client_id: clientId,
          redirect_uri: 'https://example.com/callback',
        },
      })

      expect(res.statusCode).toEqual(401)
    })

    it('should return 400 for wrong grant_type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/token',
        body: {
          grant_type: 'client_credentials',
          code: 'some-code',
          code_verifier: 'some-verifier',
          client_id: 'some-client',
          redirect_uri: 'https://example.com/callback',
        },
      })

      expect(res.statusCode).toEqual(400)
    })
  })

  describe('GET /keys', () => {
    it('should return items envelope with user API keys', async () => {
      const [user, session] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])
      const userId = decodeId(user.id)!

      await promise(oauthService.createApiKey(userId, 'Key A', ['recordings:read']))
      await promise(oauthService.createApiKey(userId, 'Key B', ['recordings:write']))

      const res = await app.inject({
        method: 'GET',
        url: '/keys',
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toHaveProperty('items')
      expect(body.items).toHaveLength(2)
    })

    it('should return 404 when no session is active', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/keys',
      })

      expect(res.statusCode).toEqual(404)
    })
  })

  describe('POST /revoke', () => {
    it('should revoke a key owned by the current user', async () => {
      const [user, session] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])
      const userId = decodeId(user.id)!

      const key = await promise(
        oauthService.createApiKey(userId, 'Revokable Key', ['recordings:read'])
      )

      const res = await app.inject({
        method: 'POST',
        url: '/revoke',
        body: { keyId: key.id },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)
    })

    it('should return 404 when no session is active', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/revoke',
        body: { keyId: 1 },
      })

      expect(res.statusCode).toEqual(404)
    })
  })

  describe('POST /clients', () => {
    it('should register a new OAuth client when authenticated', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/clients',
        body: {
          name: 'My MCP Client',
          redirectUris: ['https://example.com/callback'],
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(201)
      expect(res.json()).toMatchObject({
        clientId: expect.any(String),
        name: 'My MCP Client',
      })
    })

    it('should return 404 when no session is active', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/clients',
        body: {
          name: 'My MCP Client',
          redirectUris: ['https://example.com/callback'],
        },
      })

      expect(res.statusCode).toEqual(404)
    })
  })
})
