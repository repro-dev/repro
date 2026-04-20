import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { encodeId } from '~/modules/database'
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
    it('should create a staff user', async () => {
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createStaffUser('John Smith', email, 'hunter2!')
      )

      expect(user).toMatchObject({
        type: 'staff',
        id: expect.any(String),
        name: 'John Smith',
        email,
      })
    })

    it('should fail to create a staff user with a duplicate email address', async () => {
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createStaffUser('John Jackson', email, 'hunter2!')
      )

      await expect(
        promise(
          accountService.createStaffUser('Jack Johnson', email, 'hunter2!')
        )
      ).rejects.toThrow(resourceConflict())
    })

    it('should reject direct inserts that only differ by email case', async () => {
      const email = harness.generateRandomEmailAddress()

      await harness.db
        .insertInto('staff_users')
        .values({
          name: 'John Jackson',
          email: email.toUpperCase(),
          password: 'hunter2!',
        })
        .execute()

      await expect(
        harness.db
          .insertInto('staff_users')
          .values({
            name: 'Jack Johnson',
            email,
            password: 'hunter2!',
          })
          .execute()
      ).rejects.toThrow(/staff_users_email_lower_idx/)
    })

    it('should get a staff user by valid email and password', async () => {
      await promise(
        accountService.createStaffUser(
          'Chuck Norris',
          harness.generateRandomEmailAddress(),
          'chucknorris'
        )
      )

      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createStaffUser('John Smith', email, 'hunter2!')
      )

      const user = await promise(
        accountService.getStaffUserByEmailAndPassword(email, 'hunter2!')
      )

      expect(user).toMatchObject({
        type: 'staff',
        id: expect.any(String),
        name: 'John Smith',
        email,
      })
    })

    it('should throw not-found when getting a staff user with invalid email', async () => {
      await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await expect(
        promise(
          accountService.getStaffUserByEmailAndPassword(
            harness.generateRandomEmailAddress(),
            'hunter2!'
          )
        )
      ).rejects.toThrow(notFound())
    })

    it('should throw not-found when getting a staff user with invalid password', async () => {
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createStaffUser('John Smith', email, 'hunter2!')
      )

      await expect(
        promise(accountService.getStaffUserByEmailAndPassword(email, 'letmein'))
      ).rejects.toThrow(notFound())
    })

    it('should get a staff user by ID', async () => {
      const email = harness.generateRandomEmailAddress()

      const staffUser = await promise(
        accountService.createStaffUser('John Smith', email, 'hunter2!')
      )

      await expect(
        promise(accountService.getStaffUserById(staffUser.id))
      ).resolves.toMatchObject({
        id: staffUser.id,
        name: 'John Smith',
        email,
      })
    })

    it('should throw not-found when getting a staff user by an invalid ID', async () => {
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createStaffUser('John Smith', email, 'hunter2!')
      )

      await expect(
        promise(accountService.getStaffUserById(encodeId(99999)))
      ).rejects.toThrow(notFound())
    })

    it('should update a staff user name', async () => {
      let staffUser = await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await promise(
        accountService.updateStaffUserName(staffUser.id, 'Chuck Norris')
      )

      staffUser = await promise(accountService.getStaffUserById(staffUser.id))

      expect(staffUser.name).toEqual('Chuck Norris')
    })

    it('should throw not-found when updating the name of a non-existent staff user', async () => {
      await expect(
        promise(
          accountService.updateStaffUserName(encodeId(99999), 'Chuck Norris')
        )
      ).rejects.toThrow(notFound())
    })

    it('should deactivate a staff user', async () => {
      const email = harness.generateRandomEmailAddress()

      const staffUser = await promise(
        accountService.createStaffUser('John Smith', email, 'hunter2!')
      )

      await expect(
        promise(accountService.getStaffUserById(staffUser.id))
      ).resolves.toMatchObject({
        id: staffUser.id,
        name: 'John Smith',
        email,
      })

      await expect(
        promise(accountService.deactivateStaffUser(staffUser.id))
      ).resolves.toBeUndefined()

      await expect(
        promise(accountService.getStaffUserById(staffUser.id))
      ).rejects.toThrow(notFound())
    })
  })
})
