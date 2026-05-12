import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { fixtures } from '~/testing'
import {
  AccountTestContext,
  createAccountTestContext,
} from './account.test-utils'

describe('Routers > Account > Profile settings', () => {
  let context: AccountTestContext

  before(async () => {
    context = await createAccountTestContext()
  })

  beforeEach(async () => {
    await context.harness.reset()
  })

  after(async () => {
    await context.harness.close()
  })

  describe('GET /me/profile', () => {
    it('should return 200 with profile for authenticated user', async () => {
      const [user, session] = await context.harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])

      const res = await context.app.inject({
        method: 'GET',
        url: '/me/profile',
        cookies: {
          [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
            session.sessionToken
          ),
        },
      })

      expect(res.statusCode).toEqual(200)
      const json = res.json()
      expect(json).toMatchObject({
        type: 'user',
        id: user.id,
        name: user.name,
        email: 'user-a@example.com',
        verified: user.verified,
        createdAt: expect.any(String),
        account: {
          id: expect.any(String),
          name: expect.any(String),
        },
      })
    })

    it('should return 401 without session', async () => {
      const res = await context.app.inject({
        method: 'GET',
        url: '/me/profile',
      })

      expect(res.statusCode).toEqual(401)
    })
  })

  describe('PUT /me/name', () => {
    it('should update name and return 204 for authenticated user', async () => {
      const [user, session] = await context.harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])

      const res = await context.app.inject({
        method: 'PUT',
        url: '/me/name',
        body: {
          name: 'Updated Name',
        },
        cookies: {
          [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
            session.sessionToken
          ),
        },
      })

      expect(res.statusCode).toEqual(204)

      const updatedUser = await promise(
        context.accountService.getUserById(user.id)
      )
      expect(updatedUser.name).toEqual('Updated Name')
    })

    it('should return 400 for empty name', async () => {
      const [, session] = await context.harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])

      const res = await context.app.inject({
        method: 'PUT',
        url: '/me/name',
        body: {
          name: '',
        },
        cookies: {
          [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
            session.sessionToken
          ),
        },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('should return 401 without session', async () => {
      const res = await context.app.inject({
        method: 'PUT',
        url: '/me/name',
        body: {
          name: 'Updated Name',
        },
      })

      expect(res.statusCode).toEqual(401)
    })
  })

  describe('POST /me/send-verification', () => {
    it('should return 204 for authenticated user', async () => {
      const [, session] = await context.harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])

      const res = await context.app.inject({
        method: 'POST',
        url: '/me/send-verification',
        cookies: {
          [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
            session.sessionToken
          ),
        },
      })

      expect(res.statusCode).toEqual(204)
    })

    it('should return 401 without session', async () => {
      const res = await context.app.inject({
        method: 'POST',
        url: '/me/send-verification',
      })

      expect(res.statusCode).toEqual(401)
    })
  })
})
