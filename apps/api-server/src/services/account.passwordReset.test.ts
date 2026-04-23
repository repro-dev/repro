import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
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

  describe('Password reset', () => {
    it('should create a password reset token for an existing user', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      const token = await promise(
        accountService.createPasswordResetToken(user.id)
      )

      expect(token).toEqual(expect.any(String))
      expect(token.length).toBeGreaterThan(0)
    })

    it('should validate a valid (non-expired, unused) password reset token', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      const token = await promise(
        accountService.createPasswordResetToken(user.id)
      )

      await expect(
        promise(accountService.validatePasswordResetToken(token))
      ).resolves.toMatchObject({
        id: expect.any(String),
        userId: user.id,
      })
    })

    it('should reject a non-existent password reset token', async () => {
      await expect(
        promise(accountService.validatePasswordResetToken('does-not-exist'))
      ).rejects.toThrow(notFound())
    })

    it('should reject an already-used password reset token', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      const token = await promise(
        accountService.createPasswordResetToken(user.id)
      )

      // First use — should succeed
      await promise(accountService.applyPasswordReset(token, 'newPassword1!'))

      // Second use — should be rejected
      await expect(
        promise(accountService.validatePasswordResetToken(token))
      ).rejects.toThrow(notFound())
    })

    it('should update the password and invalidate sessions on applyPasswordReset', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      // Create a session that should be invalidated
      const session = await promise(
        accountService.createSession(user.id, 'user')
      )

      const token = await promise(
        accountService.createPasswordResetToken(user.id)
      )

      await promise(accountService.applyPasswordReset(token, 'newPassword1!'))

      // The old session should no longer exist
      await expect(
        promise(accountService.getSessionByToken(session.sessionToken))
      ).rejects.toThrow(notFound())

      // The new password should work
      await expect(
        promise(
          accountService.getUserByEmailAndPassword(email, 'newPassword1!')
        )
      ).resolves.toMatchObject({ id: user.id })
    })

    it('should reject applyPasswordReset with a non-existent token', async () => {
      await expect(
        promise(
          accountService.applyPasswordReset('does-not-exist', 'newPassword1!')
        )
      ).rejects.toThrow(notFound())
    })
  })
})
