import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { AccountService } from '~/services/account'
import { Harness, createTestHarness } from '~/testing'
import { createStaffRouter } from './staff'

describe('Routers > Staff', () => {
  let harness: Harness
  let accountService: AccountService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    accountService = harness.services.accountService
    app = harness.bootstrap(createStaffRouter(accountService))
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('Staff account login', () => {
    it('should create a new session when logging in with valid credentials', async () => {
      const user = await promise(
        accountService.createStaffUser(
          'John Smith',
          'jsmith@example.com',
          'hunter2'
        )
      )

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        body: {
          email: 'jsmith@example.com',
          password: 'hunter2',
        },
      })

      const cookie = res.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
      )

      const sessionToken = cookie?.value

      expect(sessionToken).not.toBeUndefined()

      await expect(
        promise(accountService.getSessionByToken(sessionToken as string))
      ).resolves.toMatchObject({
        id: expect.any(String),
        sessionToken,
        subjectId: user.id,
        subjectType: 'staff',
      })
    })

    it('should return not-authenticated when logging in with invalid credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        body: {
          email: 'imposter@example.net',
          password: 'nothunter2',
        },
      })

      const cookieNames = res.cookies.map(c => c.name)

      expect(cookieNames).not.toContain(harness.env.SESSION_COOKIE)
      expect(res.statusCode).toEqual(401)
    })
  })
})
