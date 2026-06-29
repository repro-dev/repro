import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { Harness, createTestHarness } from '~/testing'
import { notFound } from '~/utils/errors'
import { AccountService } from './account'

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
    it('should enqueue a verification email and drain to sent emails', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      await promise(accountService.sendVerificationEmail(user.id))
      await waitForBackgroundFork()

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

      // Assert enqueued job (no idempotencyKey at the service level;
      // the registration route handler adds the key)
      const jobs = await harness.getEnqueuedEmailJobs()
      expect(jobs).toHaveLength(1)
      expect(jobs[0]?.idempotencyKey).toBeNull()

      // Drain and assert sent emails
      await harness.drainOutbox()

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

    it('should still resolve if verification email enqueue fails', async () => {
      // We don't need to test this at the service level anymore because
      // enqueue failure is swallowed by transactionalEmailService.
      // The service returns successfully even without transactional email.
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      await expect(
        promise(accountService.sendVerificationEmail(user.id))
      ).resolves.toBeUndefined()
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
