import { RecordingMode } from '@repro/domain'
import { randomString } from '@repro/random-string'
import expect from 'expect'
import { chain, parallel, promise } from 'fluture'
import { sql } from 'kysely'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId, encodeId } from '~/modules/database'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { badRequest, notFound } from '~/utils/errors'
import { AccountService } from './account'
import { BillingService } from './billing'
import { ProjectService } from './project'

function range(size: number) {
  return new Array(size).fill(undefined)
}

function decodeRequiredId(id: string): number {
  const decoded = decodeId(id)

  if (decoded == null) {
    throw new Error(`Expected a valid encoded ID, got ${id}`)
  }

  return decoded
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

    it('should return null for accounts with no recorded activity', async () => {
      const account = await promise(
        accountService.createAccount('Inactive Account')
      )

      await expect(
        promise(accountService.getAccountById(account.id))
      ).resolves.toMatchObject({
        id: account.id,
        lastActiveAt: null,
        name: 'Inactive Account',
      })
    })

    it('should surface the newest persisted activity across recordings, sessions, and API keys', async () => {
      const account = await promise(
        accountService.createAccount('Active Account')
      )
      const user = await promise(
        accountService.createUser(
          account.id,
          'Active User',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )
      const project = await promise(
        harness.services.projectService.createProject(
          account.id,
          'Activity Project'
        )
      )
      const recording = await promise(
        harness.services.recordingService.writeInfo(
          'Activity Recording',
          'https://example.com/recording',
          'Activity description',
          RecordingMode.Replay,
          30_000,
          null,
          null,
          null
        )
      )
      const session = await promise(
        accountService.createSession(user.id, 'user')
      )
      const apiKey = await promise(
        harness.services.oauthService.createApiKey(
          decodeRequiredId(user.id),
          'Activity API key',
          []
        )
      )

      await harness.db
        .insertInto('project_recordings')
        .values({
          projectId: decodeRequiredId(project.id),
          recordingId: decodeRequiredId(recording.id),
          authorId: decodeRequiredId(user.id),
        })
        .execute()

      const recordingAt = new Date('2026-01-01T00:00:00.000Z')
      const sessionAt = new Date('2026-01-02T00:00:00.000Z')
      const apiKeyAt = new Date('2026-01-03T00:00:00.000Z')

      await sql`
        UPDATE recordings
        SET "createdAt" = ${recordingAt}
        WHERE id = ${decodeRequiredId(recording.id)}
      `.execute(harness.db)

      await sql`
        UPDATE sessions
        SET "createdAt" = ${sessionAt}
        WHERE id = ${decodeRequiredId(session.id)}
      `.execute(harness.db)

      await harness.db
        .updateTable('api_keys')
        .set({ lastUsedAt: apiKeyAt })
        .where('id', '=', apiKey.id)
        .execute()

      await expect(
        promise(accountService.getAccountById(account.id))
      ).resolves.toMatchObject({
        id: account.id,
        lastActiveAt: apiKeyAt.toISOString(),
        name: 'Active Account',
      })

      await expect(
        promise(accountService.listAccounts())
      ).resolves.toMatchObject({
        items: [
          expect.objectContaining({
            id: account.id,
            lastActiveAt: apiKeyAt.toISOString(),
            name: 'Active Account',
          }),
        ],
      })
    })

    it('should keep historical activity from inactive members and ignore activity from other accounts', async () => {
      const account = await promise(
        accountService.createAccount('Historical Account')
      )
      const activeUser = await promise(
        accountService.createUser(
          account.id,
          'Active Member',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )
      const inactiveUser = await promise(
        accountService.createUser(
          account.id,
          'Inactive Member',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )
      const otherAccount = await promise(
        accountService.createAccount('Other Account')
      )
      const otherUser = await promise(
        accountService.createUser(
          otherAccount.id,
          'Other Member',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      const activeSession = await promise(
        accountService.createSession(activeUser.id, 'user')
      )
      const inactiveApiKey = await promise(
        harness.services.oauthService.createApiKey(
          decodeRequiredId(inactiveUser.id),
          'Historical API key',
          []
        )
      )
      const otherSession = await promise(
        accountService.createSession(otherUser.id, 'user')
      )

      await sql`
        UPDATE sessions
        SET "createdAt" = ${new Date('2026-02-01T00:00:00.000Z')}
        WHERE id = ${decodeRequiredId(activeSession.id)}
      `.execute(harness.db)

      await harness.db
        .updateTable('api_keys')
        .set({ lastUsedAt: new Date('2026-02-02T00:00:00.000Z') })
        .where('id', '=', inactiveApiKey.id)
        .execute()

      await sql`
        UPDATE sessions
        SET "createdAt" = ${new Date('2026-02-03T00:00:00.000Z')}
        WHERE id = ${decodeRequiredId(otherSession.id)}
      `.execute(harness.db)

      await expect(
        promise(accountService.deactivateUser(inactiveUser.id))
      ).resolves.toBeUndefined()

      await expect(
        promise(accountService.getAccountById(account.id))
      ).resolves.toMatchObject({
        id: account.id,
        lastActiveAt: '2026-02-02T00:00:00.000Z',
        name: 'Historical Account',
      })

      await expect(
        promise(accountService.getAccountById(otherAccount.id))
      ).resolves.toMatchObject({
        id: otherAccount.id,
        lastActiveAt: '2026-02-03T00:00:00.000Z',
        name: 'Other Account',
      })
    })

    it('should throw not-found when getting an account by an invalid ID', async () => {
      await promise(accountService.createAccount('New Account'))

      await expect(
        promise(accountService.getAccountById(encodeId(999)))
      ).rejects.toThrow(notFound())
    })

    it('should list accounts newest first in 50-item pages with stable cursor boundaries', async () => {
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
        id: createdAccounts[50]?.id,
        name: `${prefix} 50`,
      })
      expect(firstPage.items[49]).toMatchObject({
        id: createdAccounts[1]?.id,
        name: `${prefix} 1`,
      })
      expect(firstPage.nextCursor).toEqual(createdAccounts[1]?.id)

      const secondPage = await promise(
        accountService.listAccounts({ cursor: firstPage.nextCursor })
      )

      expect(secondPage.items).toHaveLength(1)
      expect(secondPage.items[0]).toMatchObject({
        id: createdAccounts[0]?.id,
        name: `${prefix} 0`,
      })
      expect(secondPage.nextCursor).toBeUndefined()
    })

    it('should use encoded ID as the stable tie-breaker when account creation timestamps match', async () => {
      const first = await promise(accountService.createAccount('Tie Account 1'))
      const second = await promise(
        accountService.createAccount('Tie Account 2')
      )
      const third = await promise(accountService.createAccount('Tie Account 3'))
      const decodedIds = [first.id, second.id, third.id].map(
        id => decodeId(id)!
      )

      await sql`
        UPDATE accounts
        SET "createdAt" = ${new Date('2026-01-01T00:00:00.000Z')}
        WHERE id in (${sql.join(decodedIds)})
      `.execute(harness.db)

      const firstPage = await promise(accountService.listAccounts({ limit: 2 }))

      expect(firstPage.items.map(item => item.id)).toEqual([
        third.id,
        second.id,
      ])
      expect(firstPage.nextCursor).toEqual(second.id)

      const secondPage = await promise(
        accountService.listAccounts({ limit: 2, cursor: firstPage.nextCursor })
      )

      expect(secondPage.items.map(item => item.id)).toEqual([first.id])
      expect(secondPage.nextCursor).toBeUndefined()
    })

    it('should sort accounts by name with stable cursor boundaries', async () => {
      const prefix = randomString()
      const charlie = await promise(
        accountService.createAccount(`000 ${prefix} Charlie`)
      )
      const alpha = await promise(
        accountService.createAccount(`000 ${prefix} Alpha`)
      )
      const bravo = await promise(
        accountService.createAccount(`000 ${prefix} Bravo`)
      )

      const ascendingFirstPage = await promise(
        accountService.listAccounts({
          sortBy: 'name',
          sortDirection: 'asc',
          limit: 2,
        })
      )

      expect(ascendingFirstPage.items.map(item => item.id)).toEqual([
        alpha.id,
        bravo.id,
      ])
      expect(ascendingFirstPage.nextCursor).toEqual(bravo.id)

      const ascendingSecondPage = await promise(
        accountService.listAccounts({
          sortBy: 'name',
          sortDirection: 'asc',
          cursor: ascendingFirstPage.nextCursor,
          limit: 2,
        })
      )

      expect(ascendingSecondPage.items.map(item => item.id)).toEqual([
        charlie.id,
      ])
      expect(ascendingSecondPage.nextCursor).toBeUndefined()

      const zebra = await promise(
        accountService.createAccount(`zzz ${prefix} Zebra`)
      )
      const yak = await promise(
        accountService.createAccount(`zzz ${prefix} Yak`)
      )
      const xray = await promise(
        accountService.createAccount(`zzz ${prefix} Xray`)
      )

      const descending = await promise(
        accountService.listAccounts({
          sortBy: 'name',
          sortDirection: 'desc',
          limit: 3,
        })
      )

      expect(descending.items.map(item => item.id)).toEqual([
        zebra.id,
        yak.id,
        xray.id,
      ])
    })

    it('should reject invalid staff account cursors with bad-request', async () => {
      await expect(
        promise(accountService.listAccounts({ cursor: 'not-an-id' }))
      ).rejects.toThrow(badRequest('Invalid account cursor'))
    })

    it('should filter enriched account rows by email, account ID, and plan tier', async () => {
      const [freePlan, proPlan] = await harness.loadFixtures([
        fixtures.billing.FreePlan,
        fixtures.billing.ProPlan,
      ])
      const freeAccount = await promise(
        accountService.createAccount('Free Ops')
      )
      const proAccount = await promise(accountService.createAccount('Pro Ops'))

      await promise(
        billingService.createCheckoutSession(
          freeAccount.id,
          'owner-free@example.com',
          freePlan.id
        )
      )
      await promise(
        billingService.createCheckoutSession(
          proAccount.id,
          'owner-pro@example.com',
          proPlan.id
        )
      )
      await promise(
        accountService.createUser(
          freeAccount.id,
          'Free Owner',
          'owner-free@example.com',
          'password1'
        )
      )
      await promise(
        accountService.createUser(
          proAccount.id,
          'Pro Owner',
          'owner-pro@example.com',
          'password1'
        )
      )

      const byEmail = await promise(
        accountService.listAccounts({ search: 'OWNER-PRO@example.com' })
      )
      expect(byEmail.items).toHaveLength(1)
      expect(byEmail.items[0]).toMatchObject({
        id: proAccount.id,
        primaryEmail: 'owner-pro@example.com',
        planName: 'Repro+',
        subscriptionStatus: 'active',
        lastActiveAt: null,
        recordingCount: 0,
        userCount: 1,
        projectCount: 0,
      })

      const byId = await promise(
        accountService.listAccounts({ search: freeAccount.id })
      )
      expect(byId.items).toHaveLength(1)
      expect(byId.items[0]?.id).toEqual(freeAccount.id)

      const byPlan = await promise(
        accountService.listAccounts({ planTier: 'Repro+' })
      )
      expect(byPlan.items.map(item => item.id)).toEqual([proAccount.id])
    })

    it('should filter plan tier against the latest subscription displayed for the account', async () => {
      const [freePlan, proPlan] = await harness.loadFixtures([
        fixtures.billing.FreePlan,
        fixtures.billing.ProPlan,
      ])
      const account = await promise(
        accountService.createAccount('Changed Plan Ops')
      )

      await promise(
        billingService.createCheckoutSession(
          account.id,
          'changed-plan@example.com',
          freePlan.id
        )
      )
      await promise(
        billingService.createCheckoutSession(
          account.id,
          'changed-plan@example.com',
          proPlan.id
        )
      )

      const byOldPlan = await promise(
        accountService.listAccounts({ planTier: 'Free' })
      )
      expect(byOldPlan.items.map(item => item.id)).not.toContain(account.id)

      const byLatestPlan = await promise(
        accountService.listAccounts({ planTier: 'Repro+' })
      )
      expect(byLatestPlan.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: account.id,
            planName: 'Repro+',
          }),
        ])
      )
    })

    it('should return staff account detail with primary user and counts', async () => {
      const [proPlan] = await harness.loadFixtures([fixtures.billing.ProPlan])
      const account = await promise(accountService.createAccount('Detail Ops'))
      await promise(
        billingService.createCheckoutSession(
          account.id,
          'detail-owner@example.com',
          proPlan.id
        )
      )
      const user = await promise(
        accountService.createUser(
          account.id,
          'Detail Owner',
          'detail-owner@example.com',
          'password1'
        )
      )
      await promise(projectService.createProject(account.id, 'Detail Project'))

      await expect(
        promise(accountService.getStaffAccountDetail(account.id))
      ).resolves.toMatchObject({
        id: account.id,
        name: 'Detail Ops',
        active: true,
        createdAt: expect.any(String),
        primaryEmail: 'detail-owner@example.com',
        planName: 'Repro+',
        subscriptionStatus: 'active',
        userCount: 1,
        projectCount: 1,
        recordingCount: 0,
        lastActiveAt: null,
        primaryUser: {
          id: user.id,
          name: 'Detail Owner',
          email: 'detail-owner@example.com',
          active: true,
        },
      })
    })

    it('should reject invalid staff account detail IDs with bad-request', async () => {
      await expect(
        promise(accountService.getStaffAccountDetail('not-an-id'))
      ).rejects.toThrow(badRequest('Invalid account ID'))
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
