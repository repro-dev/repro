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
        promise(accountService.createStaffUser('Jack Johnson', email, 'hunter2!'))
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

  describe('Accounts', () => {
    it('should create an account', async () => {
      await expect(
        promise(accountService.createAccount('New Account'))
      ).resolves.toMatchObject({
        id: expect.any(String),
        name: 'New Account',
      })
    })

    it('should auto-provision a free subscription when creating an account (if plan is seeded)', async () => {
      // Seed the free plan before creating the account
      await harness.loadFixtures([fixtures.billing.FreePlan])

      const account = await promise(
        accountService.createAccount('Auto Sub Account')
      )

      const subscription = await promise(
        billingService.getSubscriptionByAccountId(account.id)
      )

      expect(subscription).toMatchObject({
        accountId: account.id,
        status: 'active',
      })

      expect(subscription.providerSubscriptionId).toBe(
        `self_provisioned_${account.id}`
      )
    })

    it('should create an account successfully even when the free plan is not seeded', async () => {
      // No plan seeded - should not throw
      await expect(
        promise(accountService.createAccount('No Plan Account'))
      ).resolves.toMatchObject({
        id: expect.any(String),
        name: 'No Plan Account',
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

    it('should list accounts in 50-item pages with stable cursor boundaries', async () => {
      // Accounts are not deleted between tests in this suite, so we need to
      // prefix the names to ensure we assert over the correct set of accounts.
      const prefix = randomString()

      const createdAccounts = [] as Array<{ id: string; name: string }>
      for (let n = 0; n < 51; n++) {
        createdAccounts.push(
          await promise(accountService.createAccount(`${prefix} ${n}`))
        )
      }

      const firstPage = await promise(accountService.listAccounts())

      expect(firstPage.items).toHaveLength(50)
      expect(firstPage.items[0]).toMatchObject({
        id: createdAccounts[0]?.id,
        name: `${prefix} 0`,
      })
      expect(firstPage.items[49]).toMatchObject({
        id: createdAccounts[49]?.id,
        name: `${prefix} 49`,
      })
      expect(firstPage.nextCursor).toEqual(createdAccounts[49]?.id)

      const secondPage = await promise(
        accountService.listAccounts({ cursor: firstPage.nextCursor })
      )

      expect(secondPage.items).toHaveLength(1)
      expect(secondPage.items[0]).toMatchObject({
        id: createdAccounts[50]?.id,
        name: `${prefix} 50`,
      })
      expect(secondPage.nextCursor).toBeUndefined()
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
