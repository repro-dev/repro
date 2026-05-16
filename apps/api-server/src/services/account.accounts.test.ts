import { randomString } from '@repro/random-string'
import expect from 'expect'
import { chain, parallel, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { encodeId } from '~/modules/database'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { notFound } from '~/utils/errors'
import { AccountService } from './account'
import { BillingService } from './billing'
import { ProjectService } from './project'

function range(size: number) {
  return new Array(size).fill(undefined)
}

describe('Services > Account', () => {
  let harness: Harness
  let accountService: AccountService
  let billingService: BillingService
  let projectService: ProjectService

  before(async () => {
    harness = await createTestHarness()
    accountService = harness.services.accountService
    billingService = harness.services.billingService
    projectService = harness.services.projectService
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
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

    it('should return account settings summary with active user and project counts', async () => {
      const account = await promise(
        accountService.createAccount('Summary Account')
      )
      await promise(
        accountService.createUser(
          account.id,
          'Active User 1',
          'active-1@example.com',
          'hunter2!'
        )
      )
      await promise(
        accountService.createUser(
          account.id,
          'Active User 2',
          'active-2@example.com',
          'hunter2!'
        )
      )
      await promise(
        accountService.createUser(
          account.id,
          'Active User 3',
          'active-3@example.com',
          'hunter2!'
        )
      )
      await promise(
        accountService.createUser(
          account.id,
          'Active User 4',
          'active-4@example.com',
          'hunter2!'
        )
      )
      await promise(
        accountService.createUser(
          account.id,
          'Active User 5',
          'active-5@example.com',
          'hunter2!'
        )
      )

      await promise(projectService.createProject(account.id, 'Active Project'))
      await promise(projectService.createProject(account.id, 'Second Project'))
      await promise(projectService.createProject(account.id, 'Third Project'))
      await promise(projectService.createProject(account.id, 'Fourth Project'))

      await expect(
        promise(accountService.getAccountSettingsSummary(account.id))
      ).resolves.toMatchObject({
        id: account.id,
        name: 'Summary Account',
        createdAt: expect.any(String),
        userCount: 5,
        projectCount: 4,
        additionalUserCount: 2,
        additionalProjectCount: 1,
        users: [
          expect.objectContaining({
            id: expect.any(String),
            name: 'Active User 5',
            email: 'active-5@example.com',
            admin: false,
          }),
          expect.objectContaining({
            name: 'Active User 4',
            email: 'active-4@example.com',
          }),
          expect.objectContaining({
            name: 'Active User 3',
            email: 'active-3@example.com',
          }),
        ],
        projects: [
          expect.objectContaining({ name: 'Fourth Project' }),
          expect.objectContaining({ name: 'Third Project' }),
          expect.objectContaining({ name: 'Second Project' }),
        ],
      })
    })

    it('should not return settings for an inactive account', async () => {
      const account = await promise(
        accountService.createAccount('Inactive Summary Account')
      )

      await promise(accountService.deactivateAccount(account.id))

      await expect(
        promise(accountService.getAccountSettingsSummary(account.id))
      ).rejects.toThrow()
    })
  })
})
