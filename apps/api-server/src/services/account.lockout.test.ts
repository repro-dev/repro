import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { Harness, createTestHarness } from '~/testing'
import { tooManyRequests } from '~/utils/errors'
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

  describe('Lockout', () => {
    it('should resolve ensureNotLocked for an unlocked user', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      await expect(
        promise(accountService.ensureNotLocked(email))
      ).resolves.toBeUndefined()
    })

    it('should resolve ensureNotLocked for a non-existent email', async () => {
      await expect(
        promise(
          accountService.ensureNotLocked(harness.generateRandomEmailAddress())
        )
      ).resolves.toBeUndefined()
    })

    it('should increment failedLoginCount on each failed login', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      await promise(accountService.recordFailedLogin(email))
      await promise(accountService.recordFailedLogin(email))
      await promise(accountService.recordFailedLogin(email))

      const row = await harness.db
        .selectFrom('users')
        .select(['failedLoginCount', 'lockedUntil'])
        .where('id', '=', decodeId(user.id))
        .executeTakeFirstOrThrow()

      expect(row.failedLoginCount).toEqual(3)
      expect(row.lockedUntil).toBeNull()
    })

    it('should lock the account after 5 failed login attempts', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      for (let i = 0; i < 5; i++) {
        await promise(accountService.recordFailedLogin(email))
      }

      const row = await harness.db
        .selectFrom('users')
        .select(['failedLoginCount', 'lockedUntil'])
        .where('id', '=', decodeId(user.id))
        .executeTakeFirstOrThrow()

      expect(row.failedLoginCount).toEqual(5)
      expect(row.lockedUntil).not.toBeNull()
      expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now())
    })

    it('should reject ensureNotLocked with TooManyRequests when account is locked', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      for (let i = 0; i < 5; i++) {
        await promise(accountService.recordFailedLogin(email))
      }

      await expect(
        promise(accountService.ensureNotLocked(email))
      ).rejects.toThrow(
        tooManyRequests('Account temporarily locked. Try again later.')
      )
    })

    it('should reset failedLoginCount and lockedUntil on resetFailedLoginCount', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      for (let i = 0; i < 5; i++) {
        await promise(accountService.recordFailedLogin(email))
      }

      await promise(accountService.resetFailedLoginCount(email))

      const row = await harness.db
        .selectFrom('users')
        .select(['failedLoginCount', 'lockedUntil'])
        .where('id', '=', decodeId(user.id))
        .executeTakeFirstOrThrow()

      expect(row.failedLoginCount).toEqual(0)
      expect(row.lockedUntil).toBeNull()
    })

    it('should resolve ensureNotLocked after lockout is reset', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      for (let i = 0; i < 5; i++) {
        await promise(accountService.recordFailedLogin(email))
      }

      await expect(
        promise(accountService.ensureNotLocked(email))
      ).rejects.toThrow(
        tooManyRequests('Account temporarily locked. Try again later.')
      )

      await promise(accountService.resetFailedLoginCount(email))

      await expect(
        promise(accountService.ensureNotLocked(email))
      ).resolves.toBeUndefined()
    })

    it('should be a no-op when recording a failed login for a non-existent email', async () => {
      await expect(
        promise(
          accountService.recordFailedLogin(harness.generateRandomEmailAddress())
        )
      ).resolves.toBeUndefined()
    })
  })
})
