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

  describe('Staff login lockout', () => {
    async function createStaffUserWithCredentials(
      email: string,
      password: string
    ) {
      return promise(
        accountService.createStaffUser('Test Staff', email, password)
      )
    }

    async function attemptStaffLogin(email: string, password: string) {
      return app.inject({
        method: 'POST',
        url: '/login',
        body: { email, password },
      })
    }

    it('should increment failedLoginCount on failed login attempts', async () => {
      const email = harness.generateRandomEmailAddress()
      await createStaffUserWithCredentials(email, 'hunter2!')

      await attemptStaffLogin(email, 'wrong-password')
      await attemptStaffLogin(email, 'wrong-password')

      const row = await harness.db
        .selectFrom('staff_users')
        .select(['failedLoginCount'])
        .where('email', '=', email)
        .executeTakeFirstOrThrow()

      expect(row.failedLoginCount).toEqual(2)
    })

    it('should lock account after 5 failed login attempts', async () => {
      const email = harness.generateRandomEmailAddress()
      await createStaffUserWithCredentials(email, 'hunter2!')

      for (let i = 0; i < 5; i++) {
        await attemptStaffLogin(email, 'wrong-password')
      }

      const row = await harness.db
        .selectFrom('staff_users')
        .select(['failedLoginCount', 'lockedUntil'])
        .where('email', '=', email)
        .executeTakeFirstOrThrow()

      expect(row.failedLoginCount).toEqual(5)
      expect(row.lockedUntil).not.toBeNull()
      expect((row.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now())
    })

    it('should count concurrent failed login attempts without losing increments', async () => {
      const email = harness.generateRandomEmailAddress()
      await createStaffUserWithCredentials(email, 'hunter2!')

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          attemptStaffLogin(email, 'wrong-password')
        )
      )

      for (const res of responses) {
        expect(res.statusCode).toEqual(401)
      }

      const row = await harness.db
        .selectFrom('staff_users')
        .select(['failedLoginCount', 'lockedUntil'])
        .where('email', '=', email)
        .executeTakeFirstOrThrow()

      expect(row.failedLoginCount).toEqual(5)
      expect(row.lockedUntil).not.toBeNull()
      expect((row.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now())
    })

    it('should return the same generic auth failure for locked and unknown staff accounts', async () => {
      const email = harness.generateRandomEmailAddress()
      await createStaffUserWithCredentials(email, 'hunter2!')

      for (let i = 0; i < 5; i++) {
        await attemptStaffLogin(email, 'wrong-password')
      }

      const lockedRes = await attemptStaffLogin(email, 'hunter2!')
      const unknownRes = await attemptStaffLogin(
        harness.generateRandomEmailAddress(),
        'wrong-password'
      )

      expect(lockedRes.statusCode).toEqual(401)
      expect(lockedRes.json()).toEqual({
        name: 'NotAuthenticatedError',
        message: 'Invalid email or password.',
      })
      expect(lockedRes.json()).toEqual(unknownRes.json())
    })

    it('should reset failedLoginCount to 0 after a successful login', async () => {
      const email = harness.generateRandomEmailAddress()
      await createStaffUserWithCredentials(email, 'hunter2!')

      await attemptStaffLogin(email, 'wrong-password')
      await attemptStaffLogin(email, 'wrong-password')

      const successRes = await attemptStaffLogin(email, 'hunter2!')
      expect(successRes.statusCode).toEqual(200)

      const row = await harness.db
        .selectFrom('staff_users')
        .select(['failedLoginCount', 'lockedUntil'])
        .where('email', '=', email)
        .executeTakeFirstOrThrow()

      expect(row.failedLoginCount).toEqual(0)
      expect(row.lockedUntil).toBeNull()
    })
  })
})
