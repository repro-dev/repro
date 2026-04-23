import expect from 'expect'
import { chain, parallel, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { encodeId } from '~/modules/database'
import { Harness, createTestHarness } from '~/testing'
import { notFound, resourceConflict } from '~/utils/errors'
import { AccountService } from './account'

function range(size: number) {
  return new Array(size).fill(undefined)
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

  describe('Users', () => {
    it('should create a user', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      expect(user).toMatchObject({
        type: 'user',
        id: expect.any(String),
        name: 'John Smith',
      })
    })

    it('should support concurrent account & user creation and access', async () => {
      await expect(
        promise(
          parallel(Infinity)(
            range(100).map((_, n) => {
              return accountService
                .createAccount(`Account ${n}`)
                .pipe(
                  chain(account =>
                    accountService.createUser(
                      account.id,
                      `User ${n}`,
                      harness.generateRandomEmailAddress(),
                      `hunter${n}`
                    )
                  )
                )
                .pipe(chain(user => accountService.ensureUser(user)))
            })
          )
        )
      ).resolves.toBeDefined()
    })

    it('should fail to create a user with a duplicate email address', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createUser(account.id, 'John Jackson', email, 'hunter2!')
      )

      await expect(
        promise(
          accountService.createUser(
            account.id,
            'Jack Johnson',
            email,
            'hunter2!'
          )
        )
      ).rejects.toThrow(resourceConflict())
    })

    it('should determine if a user is an account admin', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const userA = await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      const userB = await promise(
        accountService.createUser(
          account.id,
          'Jack Johnson',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await promise(accountService.setUserIsAdmin(userB.id, true))

      await expect(
        promise(accountService.getUserIsAdmin(userA.id))
      ).resolves.toEqual(false)

      await expect(
        promise(accountService.getUserIsAdmin(userB.id))
      ).resolves.toEqual(true)
    })

    it('should throw a not-found error when setting the admin status of a non-existent user', async () => {
      await expect(
        promise(accountService.setUserIsAdmin(encodeId(99999), true))
      ).rejects.toThrow(notFound())
    })

    it('should update the name of a user', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const user = await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await promise(accountService.updateUserName(user.id, 'John Jackson'))

      await expect(
        promise(accountService.getUserById(user.id))
      ).resolves.toMatchObject({
        type: 'user',
        id: user.id,
        name: 'John Jackson',
      })
    })

    it('should get a user by ID', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const user = await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await expect(
        promise(accountService.getUserById(user.id))
      ).resolves.toMatchObject({
        type: 'user',
        id: expect.any(String),
        name: 'John Smith',
      })
    })

    it('should throw not-found when getting a user by an invalid ID', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await expect(
        promise(accountService.getUserById(encodeId(999)))
      ).rejects.toThrow(notFound())
    })

    it('should get a user by email address', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      await expect(
        promise(accountService.getUserByEmail(email))
      ).resolves.toMatchObject({
        id: expect.any(String),
        name: 'John Smith',
        verified: false,
      })
    })

    it('should throw not-found when getting a user by invalid email address', async () => {
      await expect(
        promise(
          accountService.getUserByEmail(harness.generateRandomEmailAddress())
        )
      ).rejects.toThrow(notFound())
    })

    it('should get a user by email address and password', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      await expect(
        promise(accountService.getUserByEmailAndPassword(email, 'hunter2!'))
      ).resolves.toMatchObject({
        type: 'user',
        id: expect.any(String),
        name: 'John Smith',
      })
    })

    it('should thow not-found when getting a user by invalid email', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await expect(
        promise(
          accountService.getUserByEmailAndPassword(
            harness.generateRandomEmailAddress(),
            'hunter2!'
          )
        )
      ).rejects.toThrow(notFound())
    })

    it('should throw not-found when getting a user with an invalid password', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2!')
      )

      await expect(
        promise(accountService.getUserByEmailAndPassword(email, 'letmein'))
      ).rejects.toThrow(notFound())
    })

    it('should deactivate a user', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const user = await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await expect(
        promise(accountService.getUserById(user.id))
      ).resolves.toMatchObject({
        type: 'user',
        id: user.id,
        name: 'John Smith',
      })

      await expect(
        promise(accountService.deactivateUser(user.id))
      ).resolves.toBeUndefined()

      await expect(
        promise(accountService.getUserById(user.id))
      ).rejects.toThrow(notFound())
    })

    it('should get the account for a user', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const user = await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await expect(
        promise(accountService.getAccountForUser(user.id))
      ).resolves.toMatchObject({ ...account })
    })
  })
})
