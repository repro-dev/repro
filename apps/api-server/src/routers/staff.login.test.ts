import { unsign } from '@fastify/cookie'
import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { AccountService } from '~/services/account'
import { ProjectService } from '~/services/project'
import { Harness, createTestHarness } from '~/testing'
import { createStaffRouter } from './staff'

describe('Routers > Staff', () => {
  let harness: Harness
  let accountService: AccountService
  let projectService: ProjectService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    accountService = harness.services.accountService
    projectService = harness.services.projectService
    app = harness.bootstrap(createStaffRouter(accountService, projectService))
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
          'hunter2!'
        )
      )

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        body: {
          email: 'jsmith@example.com',
          password: 'hunter2!',
        },
      })

      const cookie = res.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
      )

      // Cookie value is signed (rawToken.signature); unsign to get the raw token for DB lookup
      const rawToken = unsign(
        cookie?.value ?? '',
        harness.env.SESSION_SECRET
      ).value
      expect(rawToken).not.toBeNull()
      const sessionToken = rawToken as string

      await expect(
        promise(accountService.getSessionByToken(sessionToken))
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
