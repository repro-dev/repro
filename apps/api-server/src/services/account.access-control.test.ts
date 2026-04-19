import expect from 'expect'
import { chain, map, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { encodeId } from '~/modules/database'
import { Harness, createTestHarness } from '~/testing'
import { permissionDenied } from '~/utils/errors'
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

  describe('Access control', () => {
    it('should ensure a staff user is valid', async () => {
      const staffUser = await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      const inactiveStaffUser = await promise(
        accountService
          .createStaffUser(
            'Chuck Norris',
            harness.generateRandomEmailAddress(),
            'chucknorris'
          )
          .pipe(
            chain(user =>
              accountService.deactivateStaffUser(user.id).pipe(map(() => user))
            )
          )
      )

      await expect(
        promise(accountService.ensureStaffUser(staffUser))
      ).resolves.toEqual(staffUser)

      await expect(
        promise(accountService.ensureStaffUser(inactiveStaffUser))
      ).rejects.toThrow(permissionDenied())

      await expect(
        promise(accountService.ensureStaffUser(null))
      ).rejects.toThrow(permissionDenied())

      await expect(
        promise(
          accountService.ensureStaffUser({
            type: 'staff',
            id: encodeId(99999),
            name: 'Does not exist',
            email: harness.generateRandomEmailAddress(),
            isAdmin: false,
            isActive: false,
          })
        )
      ).rejects.toThrow(permissionDenied())

      await expect(
        promise(
          accountService.ensureStaffUser({
            type: 'user',
            id: staffUser.id,
            name: 'A User',
            verified: true,
          })
        )
      ).rejects.toThrow(permissionDenied())
    })

    it('should ensure a user is valid', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const user = await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await expect(promise(accountService.ensureUser(user))).resolves.toEqual(
        user
      )

      await expect(promise(accountService.ensureUser(null))).rejects.toThrow(
        permissionDenied()
      )
    })

    it('should ensure a user is an admin', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const userA = await promise(
        accountService.createUser(
          account.id,
          'John Jackson',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      const userB = await promise(
        accountService.createUser(
          account.id,
          'Jack Johnson',
          harness.generateRandomEmailAddress(),
          'nothunter2'
        )
      )

      await promise(accountService.setUserIsAdmin(userA.id, true))

      await expect(
        promise(accountService.ensureUserIsAdmin(userA))
      ).resolves.toEqual(userA)

      await expect(
        promise(accountService.ensureUserIsAdmin(userB))
      ).rejects.toThrow(permissionDenied())

      await expect(
        promise(accountService.ensureUserIsAdmin(null))
      ).rejects.toThrow(permissionDenied())
    })

    it('should ensure that a user can access an account', async () => {
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
        promise(accountService.ensureCanAccessAccount(user, account.id))
      ).resolves.toEqual(user)

      await expect(
        promise(accountService.ensureCanAccessAccount(null, account.id))
      ).rejects.toThrow(permissionDenied())
    })

    it('should ensure that a user must be an admin to modify an account', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const adminUser = await promise(
        accountService
          .createUser(
            account.id,
            'John Smith',
            harness.generateRandomEmailAddress(),
            'hunter2!'
          )
          .pipe(
            chain(user =>
              accountService.setUserIsAdmin(user.id, true).pipe(map(() => user))
            )
          )
      )

      const user = await promise(
        accountService.createUser(
          account.id,
          'Jack Johnson',
          harness.generateRandomEmailAddress(),
          'nothunter2'
        )
      )

      await expect(
        promise(accountService.ensureCanModifyAccount(adminUser, account.id))
      ).resolves.toEqual(adminUser)

      await expect(
        promise(accountService.ensureCanModifyAccount(user, account.id))
      ).rejects.toThrow(permissionDenied())

      await expect(
        promise(accountService.ensureCanModifyAccount(null, account.id))
      ).rejects.toThrow(permissionDenied())
    })

    it('should ensure that a user cannot access a different account', async () => {
      const accountA = await promise(accountService.createAccount('Account A'))
      const accountB = await promise(accountService.createAccount('Account B'))

      const user = await promise(
        accountService.createUser(
          accountA.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await expect(
        promise(accountService.ensureCanAccessAccount(user, accountB.id))
      ).rejects.toThrow(permissionDenied())
    })

    it('should ensure that a user cannot modify a different account', async () => {
      const accountA = await promise(accountService.createAccount('Account A'))
      const accountB = await promise(accountService.createAccount('Account B'))

      const user = await promise(
        accountService.createUser(
          accountA.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await promise(accountService.setUserIsAdmin(user.id, true))

      await expect(
        promise(accountService.ensureCanModifyAccount(user, accountB.id))
      ).rejects.toThrow(permissionDenied())
    })

    it('should ensure that a staff user can modify any account', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const staffUser = await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await expect(
        promise(accountService.ensureCanModifyAccount(staffUser, account.id))
      ).resolves.toEqual(staffUser)
    })

    it('should ensure that a user can modify their own user record', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const user = await promise(
        accountService.createUser(
          account.id,
          'Jack Johnson',
          'jj@example.com',
          'hunter2!'
        )
      )

      await expect(
        promise(accountService.ensureCanModifyUser(user, user.id))
      ).resolves.toEqual(user)
    })

    it('should ensure that a user must be an account admin to modify other users', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const adminUser = await promise(
        accountService
          .createUser(
            account.id,
            'John Smith',
            harness.generateRandomEmailAddress(),
            'hunter2!'
          )
          .pipe(
            chain(user =>
              accountService.setUserIsAdmin(user.id, true).pipe(map(() => user))
            )
          )
      )

      const nonAdminUser = await promise(
        accountService.createUser(
          account.id,
          'Jack Johnson',
          harness.generateRandomEmailAddress(),
          'nothunter2'
        )
      )

      const targetUser = await promise(
        accountService.createUser(
          account.id,
          'John Hackson',
          harness.generateRandomEmailAddress(),
          'letmein'
        )
      )

      await expect(
        promise(accountService.ensureCanModifyUser(adminUser, targetUser.id))
      ).resolves.toEqual(adminUser)

      await expect(
        promise(accountService.ensureCanModifyUser(nonAdminUser, targetUser.id))
      ).rejects.toThrow(permissionDenied())

      await expect(
        promise(accountService.ensureCanModifyUser(null, targetUser.id))
      ).rejects.toThrow(permissionDenied())
    })

    it('should ensure that a user cannot modify users in a different account', async () => {
      const [accountA, accountB] = await Promise.all([
        promise(accountService.createAccount('Account A')),
        promise(accountService.createAccount('Account B')),
      ])

      const actor = await promise(
        accountService
          .createUser(
            accountA.id,
            'John Smith',
            harness.generateRandomEmailAddress(),
            'hunter2!'
          )
          .pipe(
            chain(user =>
              accountService.setUserIsAdmin(user.id, true).pipe(map(() => user))
            )
          )
      )

      const subject = await promise(
        accountService.createUser(
          accountB.id,
          'Jack Johnson',
          harness.generateRandomEmailAddress(),
          'nothunter2'
        )
      )

      await expect(
        promise(accountService.ensureCanModifyUser(actor, subject.id))
      ).rejects.toThrow(permissionDenied())
    })

    it('should ensure that a staff user can modify any user', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const staffUser = await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      const subject = await promise(
        accountService.createUser(
          account.id,
          'Jack Johnson',
          harness.generateRandomEmailAddress(),
          'nothunter2'
        )
      )

      await expect(
        promise(accountService.ensureCanModifyUser(staffUser, subject.id))
      ).resolves.toEqual(staffUser)
    })
  })
})
