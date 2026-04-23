import expect from 'expect'
import { promise } from 'fluture'
import { sql } from 'kysely'
import { after, before, beforeEach, describe, it, mock } from 'node:test'
import { decodeId } from '~/modules/database'
import { createStubEmailUtils } from '~/modules/email-utils'
import { Harness, createTestHarness } from '~/testing'
import { notFound } from '~/utils/errors'
import { AccountService, createAccountService } from './account'

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
    it('rejects sessions older than hard expiry', async () => {
      const account = await promise(accountService.createAccount('Expiry Test'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'Jane Doe', email, 'hunter2!')
      )

      const session = await promise(
        accountService.createSession(user.id, 'user')
      )

      // Negative sessionHardExpiry puts the cutoff in the future, making all existing sessions expired
      const stubEmail = createStubEmailUtils([])
      const expiredService = createAccountService(
        harness.db,
        stubEmail,
        undefined,
        -60
      )

      await expect(
        promise(expiredService.getSessionByToken(session.sessionToken))
      ).rejects.toThrow(notFound())
    })

    it('deleteExpiredSessions removes stale sessions', async () => {
      const account = await promise(
        accountService.createAccount('Cleanup Test')
      )
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'Jane Doe', email, 'hunter2!')
      )

      const session = await promise(
        accountService.createSession(user.id, 'user')
      )

      // Negative sessionHardExpiry puts the cutoff in the future, making all existing sessions expired
      const stubEmail = createStubEmailUtils([])
      const expiredService = createAccountService(
        harness.db,
        stubEmail,
        undefined,
        -60
      )

      await expect(
        promise(expiredService.deleteExpiredSessions())
      ).resolves.toEqual(1n)

      // The session row should now be gone even when looked up via the normal service
      await expect(
        promise(accountService.getSessionByToken(session.sessionToken))
      ).rejects.toThrow(notFound())
    })

    it('deleteExpiredSessions removes sessions at the exact expiry cutoff', async () => {
      const account = await promise(
        accountService.createAccount('Exact Cutoff Cleanup Test')
      )
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'Jane Doe', email, 'hunter2!')
      )

      const session = await promise(
        accountService.createSession(user.id, 'user')
      )

      const fixedNow = new Date('2030-01-01T00:00:00.000Z')
      mock.timers.enable({ apis: ['Date'], now: fixedNow })

      try {
        const cutoff = new Date(fixedNow.getTime() - 60 * 1000)

        await sql`
          UPDATE sessions
          SET "createdAt" = ${cutoff}
          WHERE id = ${decodeId(session.id) as number}
        `.execute(harness.db)

        const stubEmail = createStubEmailUtils([])
        const expiredService = createAccountService(
          harness.db,
          stubEmail,
          undefined,
          60
        )

        await expect(
          promise(expiredService.getSessionByToken(session.sessionToken))
        ).rejects.toThrow(notFound())

        await expect(
          promise(expiredService.deleteExpiredSessions())
        ).resolves.toEqual(1n)
      } finally {
        mock.timers.reset()
      }

      await expect(
        promise(accountService.getSessionByToken(session.sessionToken))
      ).rejects.toThrow(notFound())
    })
  })
})
