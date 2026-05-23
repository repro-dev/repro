import expect from 'expect'
import { promise } from 'fluture'
import { sql } from 'kysely'
import { after, before, beforeEach, describe, it, mock } from 'node:test'
import { decodeId } from '~/modules/database'
import { Harness, createTestHarness } from '~/testing'
import { notFound } from '~/utils/errors'
import { AccountService } from './account'

describe('Services > Account', () => {
  let harness: Harness
  let accountService: AccountService

  before(async () => {
    harness = await createTestHarness()
    accountService = harness.services.accountService
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('session expiry', () => {
    async function createUserSession(createdAt: Date) {
      const account = await promise(accountService.createAccount('Expiry Test'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'Jane Doe', email, 'hunter2!')
      )

      const session = await promise(
        accountService.createSession(user.id, 'user')
      )

      await sql`
        UPDATE sessions
        SET "createdAt" = ${createdAt}
        WHERE id = ${decodeId(session.id) as number}
      `.execute(harness.db)

      return session
    }

    async function createStaffSession(createdAt: Date) {
      const email = harness.generateRandomEmailAddress()

      const staffUser = await promise(
        accountService.createStaffUser('Staff User', email, 'hunter2!')
      )

      const session = await promise(
        accountService.createSession(staffUser.id, 'staff')
      )

      await sql`
        UPDATE sessions
        SET "createdAt" = ${createdAt}
        WHERE id = ${decodeId(session.id) as number}
      `.execute(harness.db)

      return session
    }

    it('accepts user sessions older than 28 days but younger than 90 days', async () => {
      const fixedNow = new Date('2030-01-01T00:00:00.000Z')
      mock.timers.enable({ apis: ['Date'], now: fixedNow })

      try {
        const session = await createUserSession(
          new Date(fixedNow.getTime() - 45 * 24 * 3600 * 1000)
        )

        await expect(
          promise(accountService.getSessionByToken(session.sessionToken))
        ).resolves.toMatchObject({
          id: session.id,
          subjectType: 'user',
        })
      } finally {
        mock.timers.reset()
      }
    })

    it('rejects user sessions at the 90 day hard expiry cutoff', async () => {
      const fixedNow = new Date('2030-01-01T00:00:00.000Z')
      mock.timers.enable({ apis: ['Date'], now: fixedNow })

      try {
        const session = await createUserSession(
          new Date(fixedNow.getTime() - 90 * 24 * 3600 * 1000)
        )

        await expect(
          promise(accountService.getSessionByToken(session.sessionToken))
        ).rejects.toThrow(notFound())
      } finally {
        mock.timers.reset()
      }
    })

    it('rejects staff sessions after the 7 day hard expiry cutoff', async () => {
      const fixedNow = new Date('2030-01-01T00:00:00.000Z')
      mock.timers.enable({ apis: ['Date'], now: fixedNow })

      try {
        const session = await createStaffSession(
          new Date(fixedNow.getTime() - 8 * 24 * 3600 * 1000)
        )

        await expect(
          promise(accountService.getSessionByToken(session.sessionToken))
        ).rejects.toThrow(notFound())
      } finally {
        mock.timers.reset()
      }
    })

    it('deleteExpiredSessions removes expired user and staff sessions by separate cutoffs', async () => {
      const fixedNow = new Date('2030-01-01T00:00:00.000Z')
      mock.timers.enable({ apis: ['Date'], now: fixedNow })

      try {
        const expiredUserSession = await createUserSession(
          new Date(fixedNow.getTime() - 91 * 24 * 3600 * 1000)
        )
        const activeUserSession = await createUserSession(
          new Date(fixedNow.getTime() - 89 * 24 * 3600 * 1000)
        )
        const expiredStaffSession = await createStaffSession(
          new Date(fixedNow.getTime() - 8 * 24 * 3600 * 1000)
        )
        const activeStaffSession = await createStaffSession(
          new Date(fixedNow.getTime() - 6 * 24 * 3600 * 1000)
        )

        await expect(
          promise(accountService.deleteExpiredSessions())
        ).resolves.toEqual(2n)

        await expect(
          promise(
            accountService.getSessionByToken(expiredUserSession.sessionToken)
          )
        ).rejects.toThrow(notFound())

        await expect(
          promise(
            accountService.getSessionByToken(expiredStaffSession.sessionToken)
          )
        ).rejects.toThrow(notFound())

        await expect(
          promise(
            accountService.getSessionByToken(activeUserSession.sessionToken)
          )
        ).resolves.toMatchObject({ id: activeUserSession.id })

        await expect(
          promise(
            accountService.getSessionByToken(activeStaffSession.sessionToken)
          )
        ).resolves.toMatchObject({ id: activeStaffSession.id })
      } finally {
        mock.timers.reset()
      }
    })
  })
})
