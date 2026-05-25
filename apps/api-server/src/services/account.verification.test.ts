import expect from 'expect'
import { promise, reject } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { ApiLogger } from '~/modules/logger'
import { Harness, createTestHarness } from '~/testing'
import { notFound } from '~/utils/errors'
import { AccountService } from './account'

function createLoggerSpy() {
  const calls: Array<{ payload: unknown; message?: string }> = []
  const logger: ApiLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (payload, message) => {
      calls.push({ payload, message })
    },
    fatal: () => {},
    child: () => logger,
  }
  return { logger, calls }
}

function waitForBackgroundFork() {
  return new Promise(resolve => setImmediate(resolve))
}

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

  describe('Verification', () => {
    it('should send a verification email for a user', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      await promise(accountService.sendVerificationEmail(user.id))

      const verificationToken = await harness.db
        .selectFrom('users')
        .select('verificationToken')
        .where('id', '=', decodeId(user.id))
        .executeTakeFirstOrThrow()
        .then(row => row.verificationToken)

      expect(verificationToken).not.toEqual('')

      const verificationUrl = new URL(
        '/account/verify',
        harness.env.REPRO_APP_URL
      )
      verificationUrl.searchParams.set('verificationToken', verificationToken)
      verificationUrl.searchParams.set('email', email)

      const [message] = harness.getSentEmails()

      expect(harness.getSentEmails()).toHaveLength(1)
      expect(message).toMatchObject({
        to: email,
        from: 'noreply@repro.dev',
        subject: 'Verify your Repro email address',
      })
      expect(message?.html).toContain(
        verificationUrl.toString().replaceAll('&', '&amp;')
      )
    })

    it('should still resolve if verification email delivery fails', async () => {
      const { logger, calls } = createLoggerSpy()
      const failingHarness = await createTestHarness({
        sendEmail: () => reject(new Error('unexpected send')),
        logger,
      })

      try {
        const failingAccountService = failingHarness.services.accountService
        const account = await promise(
          failingAccountService.createAccount('New Account')
        )
        const email = failingHarness.generateRandomEmailAddress()

        const user = await promise(
          failingAccountService.createUser(
            account.id,
            'John Smith',
            email,
            'hunter2!'
          )
        )

        await expect(
          promise(
            failingAccountService.sendVerificationEmail(user.id, {
              context: {
                requestId: 'req-123',
                route: '/account/me/send-verification',
                method: 'POST',
                targetUserId: user.id,
              },
            })
          )
        ).resolves.toBeUndefined()

        await waitForBackgroundFork()

        expect(calls).toHaveLength(1)
        expect(calls[0]).toMatchObject({
          payload: {
            event: 'transactional_email.send_failed',
            emailKind: 'verification',
            requestId: 'req-123',
            route: '/account/me/send-verification',
            method: 'POST',
            targetUserId: user.id,
          },
          message: 'Transactional email send failed',
        })
        expect(JSON.stringify(calls[0])).not.toContain(email)
      } finally {
        await failingHarness.close()
      }
    })

    it('should verify a user', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      const verificationToken = await harness.db
        .selectFrom('users')
        .select('verificationToken')
        .where('id', '=', decodeId(user.id))
        .executeTakeFirstOrThrow()
        .then(row => row.verificationToken)

      await expect(
        promise(accountService.verifyUser(verificationToken, email))
      ).resolves.toBeUndefined()
    })

    it('should throw not-found when verifying with an invalid token', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      await expect(
        promise(accountService.verifyUser('invalid-token', email))
      ).rejects.toThrow(notFound())
    })

    it('should throw not-found when verifying a user that does not exist', async () => {
      await expect(
        promise(
          accountService.verifyUser(
            'does-not-exist',
            harness.generateRandomEmailAddress()
          )
        )
      ).rejects.toThrow(notFound())
    })
  })
})
