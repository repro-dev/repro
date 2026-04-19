import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Harness, createTestHarness } from '~/testing'
import { notFound, resourceConflict } from '~/utils/errors'
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

  describe('Staff users', () => {
    it('should create a staff user with a normalized email address', async () => {
      const email = 'John.Smith@Example.com'
      const normalizedEmail = email.toLowerCase()

      const user = await promise(
        accountService.createStaffUser('John Smith', email, 'hunter2!')
      )

      expect(user).toMatchObject({
        type: 'staff',
        id: expect.any(String),
        name: 'John Smith',
        email: normalizedEmail,
      })

      await expect(
        promise(
          accountService.getStaffUserByEmailAndPassword(
            normalizedEmail,
            'hunter2!'
          )
        )
      ).resolves.toMatchObject({
        id: user.id,
        email: normalizedEmail,
      })
    })

    it('should fail to create a staff user with a duplicate email address regardless of casing', async () => {
      const email = 'John.Smith@Example.com'

      await promise(
        accountService.createStaffUser('John Jackson', email, 'hunter2!')
      )

      await expect(
        promise(
          accountService.createStaffUser(
            'Jack Johnson',
            email.toLowerCase(),
            'hunter2!'
          )
        )
      ).rejects.toThrow(resourceConflict())
    })

    it('should not allow a passwordless staff account to authenticate with an empty password', async () => {
      const email = harness.generateRandomEmailAddress()

      const staffUser = await promise(
        accountService.createStaffUser('OAuth Staff', email, '')
      )

      await expect(
        promise(accountService.getStaffUserByEmailAndPassword(email, ''))
      ).rejects.toThrow(notFound())

      await expect(
        promise(accountService.getStaffUserById(staffUser.id))
      ).resolves.toMatchObject({
        id: staffUser.id,
        email,
      })
    })
  })
})
