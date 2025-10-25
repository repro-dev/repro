import { randomString } from '@repro/random-string'
import expect from 'expect'
import { chain, map, parallel, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId, encodeId } from '~/modules/database'
import { Harness, createTestHarness } from '~/testing'
import { notFound, permissionDenied, resourceConflict } from '~/utils/errors'
import { AccountService } from './account'

// TODO: lift into functional utilities
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

  describe('Staff users', () => {
    it('should create a staff user', async () => {
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createStaffUser('John Smith', email, 'hunter2')
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
        accountService.createStaffUser('John Jackson', email, 'hunter2')
      )

      await expect(
        promise(
          accountService.createStaffUser('Jack Johnson', email, 'hunter2')
        )
      ).rejects.toThrow(resourceConflict())
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
        accountService.createStaffUser('John Smith', email, 'hunter2')
      )

      const user = await promise(
        accountService.getStaffUserByEmailAndPassword(email, 'hunter2')
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
          'hunter2'
        )
      )

      await expect(
        promise(
          accountService.getStaffUserByEmailAndPassword(
            harness.generateRandomEmailAddress(),
            'hunter2'
          )
        )
      ).rejects.toThrow(notFound())
    })

    it('should throw not-found when getting a staff user with invalid password', async () => {
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createStaffUser('John Smith', email, 'hunter2')
      )

      await expect(
        promise(accountService.getStaffUserByEmailAndPassword(email, 'letmein'))
      ).rejects.toThrow(notFound())
    })

    it('should get a staff user by ID', async () => {
      const email = harness.generateRandomEmailAddress()

      const staffUser = await promise(
        accountService.createStaffUser('John Smith', email, 'hunter2')
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
        accountService.createStaffUser('John Smith', email, 'hunter2')
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
          'hunter2'
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
        accountService.createStaffUser('John Smith', email, 'hunter2')
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

  describe('Accounts', () => {
    it('should create an account', async () => {
      await expect(
        promise(accountService.createAccount('New Account'))
      ).resolves.toMatchObject({
        id: expect.any(String),
        name: 'New Account',
      })
    })

    it('should support concurrent account creation and access', async () => {
      await expect(
        promise(
          parallel(Infinity)(
            range(100).map((_, n) =>
              accountService
                .createAccount(`Account ${n}`)
                .pipe(
                  chain(account => accountService.getAccountById(account.id))
                )
            )
          )
        )
      ).resolves.toBeDefined()
    })

    it('should get an account by ID', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      await expect(
        promise(accountService.getAccountById(account.id))
      ).resolves.toMatchObject({
        id: account.id,
        name: 'New Account',
      })
    })

    it('should throw not-found when getting an account by an invalid ID', async () => {
      await promise(accountService.createAccount('New Account'))

      await expect(
        promise(accountService.getAccountById(encodeId(999)))
      ).rejects.toThrow(notFound())
    })

    it('should list all accounts', async () => {
      // Accounts are not deleted between tests in this suite, so we need to
      // prefix the names to ensure we assert over the correct set of accounts.
      const prefix = randomString()

      await promise(
        parallel(Infinity)(
          range(10).map((_, n) =>
            accountService.createAccount(`${prefix} ${n}`)
          )
        )
      )

      await expect(
        promise(
          accountService
            .listAccounts()
            .pipe(
              map(accounts =>
                accounts.sort((a, b) => a.name.localeCompare(b.name))
              )
            )
        )
      ).resolves.toMatchObject(
        range(10).map((_, n) => ({
          id: expect.any(String),
          name: `${prefix} ${n}`,
        }))
      )
    })

    it('should update an account name', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      await expect(
        promise(accountService.updateAccountName(account.id, 'Newer Account'))
      ).resolves.toBeUndefined()

      await expect(
        promise(accountService.getAccountById(account.id))
      ).resolves.toMatchObject({
        id: account.id,
        name: 'Newer Account',
      })
    })

    it('should throw not-found when attempting to update the name of a non-existent account', async () => {
      await expect(
        promise(accountService.updateAccountName(encodeId(999), 'New Account'))
      ).rejects.toThrow(notFound())
    })
  })

  describe('Invitations', () => {
    it('should create a new invitation', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      await expect(
        promise(accountService.createInvitation(account.id, email))
      ).resolves.toMatchObject({
        id: expect.any(String),
        token: expect.any(String),
        email,
      })
    })

    it('should reset the token when creating an invitation for an email that already exists', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const invitationA = await promise(
        accountService.createInvitation(account.id, email)
      )

      const invitationB = await promise(
        accountService.createInvitation(account.id, email)
      )

      expect(invitationA.id).toEqual(invitationB.id)
      expect(invitationA.email).toEqual(invitationB.email)
      expect(invitationA.token).not.toEqual(invitationB.token)
    })

    it('should deactivate an invitation', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const invitation = await promise(
        accountService.createInvitation(account.id, email)
      )

      await expect(
        promise(
          accountService.getInvitationByTokenAndEmail(
            invitation.token,
            invitation.email
          )
        )
      ).resolves.toMatchObject({ ...invitation })

      await expect(
        promise(accountService.deactivateInvitation(invitation.id))
      ).resolves.toBeUndefined()

      await expect(
        promise(
          accountService.getInvitationByTokenAndEmail(
            invitation.token,
            invitation.email
          )
        )
      ).rejects.toThrow(notFound())
    })

    it('should throw not-found when deactivating a non-existent invitation', async () => {
      await expect(
        promise(accountService.deactivateInvitation(encodeId(999)))
      ).rejects.toThrow(notFound())
    })

    it('should get an invitation by token and email address', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const invitation = await promise(
        accountService.createInvitation(account.id, email)
      )

      await expect(
        promise(
          accountService.getInvitationByTokenAndEmail(invitation.token, email)
        )
      ).resolves.toMatchObject({ ...invitation })
    })

    it('should throw not-found when getting a non-existent invitation by token and email address', async () => {
      await expect(
        promise(
          accountService.getInvitationByTokenAndEmail(
            encodeId(999),
            harness.generateRandomEmailAddress()
          )
        )
      ).rejects.toThrow(notFound())
    })
  })

  describe('Users', () => {
    it('should create a user', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2')
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
        accountService.createUser(account.id, 'John Jackson', email, 'hunter2')
      )

      await expect(
        promise(
          accountService.createUser(
            account.id,
            'Jack Johnson',
            email,
            'hunter2'
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
          'hunter2'
        )
      )

      const userB = await promise(
        accountService.createUser(
          account.id,
          'Jack Johnson',
          harness.generateRandomEmailAddress(),
          'hunter2'
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
          'hunter2'
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
          'hunter2'
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
          'hunter2'
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
        accountService.createUser(account.id, 'John Smith', email, 'hunter2')
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
        accountService.createUser(account.id, 'John Smith', email, 'hunter2')
      )

      await expect(
        promise(accountService.getUserByEmailAndPassword(email, 'hunter2'))
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
          'hunter2'
        )
      )

      await expect(
        promise(
          accountService.getUserByEmailAndPassword(
            harness.generateRandomEmailAddress(),
            'hunter2'
          )
        )
      ).rejects.toThrow(notFound())
    })

    it('should throw not-found when getting a user with an invalid password', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2')
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
          'hunter2'
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
          'hunter2'
        )
      )

      await expect(
        promise(accountService.getAccountForUser(user.id))
      ).resolves.toMatchObject({ ...account })
    })
  })

  describe('Sessions', () => {
    it('should create a new session for a user', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const user = await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2'
        )
      )

      await expect(
        promise(accountService.createSession(user.id, 'user'))
      ).resolves.toMatchObject({
        id: expect.any(String),
        sessionToken: expect.any(String),
        subjectId: user.id,
        subjectType: 'user',
      })
    })

    it('should create a new session for a staff user', async () => {
      const staffUser = await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2'
        )
      )

      await expect(
        promise(accountService.createSession(staffUser.id, 'staff'))
      ).resolves.toMatchObject({
        id: expect.any(String),
        sessionToken: expect.any(String),
        subjectId: staffUser.id,
        subjectType: 'staff',
      })
    })

    it('should get a session by session token', async () => {
      const staffUser = await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2'
        )
      )

      const session = await promise(
        accountService.createSession(staffUser.id, 'staff')
      )

      await expect(
        promise(accountService.getSessionByToken(session.sessionToken))
      ).resolves.toMatchObject({ ...session })
    })

    it('should throw not-found when getting a non-existent session by session token', async () => {
      await expect(
        promise(accountService.getSessionByToken(encodeId(99999)))
      ).rejects.toThrow(notFound())
    })

    it('should destroy a session', async () => {
      const staffUser = await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2'
        )
      )

      const session = await promise(
        accountService.createSession(staffUser.id, 'user')
      )

      await expect(
        promise(accountService.destroySession(session.sessionToken))
      ).resolves.toBeUndefined()

      await expect(
        promise(accountService.getSessionByToken(session.sessionToken))
      ).rejects.toThrow(notFound())
    })

    it('should throw not-found when destroying a non-existent session', async () => {
      await expect(
        promise(accountService.destroySession(encodeId(99999)))
      ).rejects.toThrow(notFound())
    })
  })

  describe('Verification', () => {
    it('should verify a user', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const user = await promise(
        accountService.createUser(account.id, 'John Smith', email, 'hunter2')
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
            encodeId(99999),
            harness.generateRandomEmailAddress()
          )
        )
      ).rejects.toThrow(notFound())
    })
  })

  describe('Access control', () => {
    it('should ensure a staff user is valid', async () => {
      const staffUser = await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2'
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
          'hunter2'
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
          'hunter2'
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
          'hunter2'
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
            'hunter2'
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
          'hunter2'
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
          'hunter2'
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
          'hunter2'
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
          'hunter2'
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
            'hunter2'
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
            'hunter2'
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
          'hunter2'
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
