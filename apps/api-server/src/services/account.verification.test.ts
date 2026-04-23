import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
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

  describe('Verification', () => {
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
