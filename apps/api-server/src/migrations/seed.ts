import * as argon2 from '@node-rs/argon2'
import { ProjectRole } from '@repro/domain'
import { defaultEnv as env } from '~/config/env'
import { createPostgresDatabaseClient } from '~/modules/database/database-postgres'
import { Database } from '~/modules/database/types'
import { Storage } from '~/modules/storage'
import { createS3StorageClient } from '~/modules/storage-s3'
import { seedRecordings } from './seed-recordings'

const PASSWORD = 'password'

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password)
}

async function seedBillingPlans(db: Database) {
  console.log('Seeding billing plans...')

  const freePlan = await db
    .insertInto('billing_plans')
    .values({
      name: 'Free',
      providerPriceId: 'dev_pri_free_month',
      providerProductId: 'dev_pro_free',
      interval: 'month',
      active: 1,
    })
    .onConflict(oc => oc.column('providerPriceId').doNothing())
    .returning(['id'])
    .executeTakeFirst()

  const plusPlan = await db
    .insertInto('billing_plans')
    .values({
      name: 'Repro+',
      providerPriceId: 'dev_pri_plus_month',
      providerProductId: 'dev_pro_plus',
      interval: 'month',
      active: 1,
    })
    .onConflict(oc => oc.column('providerPriceId').doNothing())
    .returning(['id'])
    .executeTakeFirst()

  const proPlan = await db
    .insertInto('billing_plans')
    .values({
      name: 'Repro++',
      providerPriceId: 'dev_pri_pro_month',
      providerProductId: 'dev_pro_pro',
      interval: 'month',
      active: 1,
    })
    .onConflict(oc => oc.column('providerPriceId').doNothing())
    .returning(['id'])
    .executeTakeFirst()

  if (freePlan) {
    await db
      .insertInto('billing_plan_entitlements')
      .values([
        {
          planId: freePlan.id,
          feature: 'recordings',
          enabled: 1,
          limit: 10,
        },
        {
          planId: freePlan.id,
          feature: 'team',
          enabled: 0,
          limit: null,
        },
      ])
      .onConflict(oc => oc.columns(['planId', 'feature']).doNothing())
      .execute()
  }

  if (plusPlan) {
    await db
      .insertInto('billing_plan_entitlements')
      .values([
        {
          planId: plusPlan.id,
          feature: 'recordings',
          enabled: 1,
          limit: null,
        },
        {
          planId: plusPlan.id,
          feature: 'team',
          enabled: 1,
          limit: null,
        },
      ])
      .onConflict(oc => oc.columns(['planId', 'feature']).doNothing())
      .execute()
  }

  if (proPlan) {
    await db
      .insertInto('billing_plan_entitlements')
      .values([
        {
          planId: proPlan.id,
          feature: 'recordings',
          enabled: 1,
          limit: null,
        },
        {
          planId: proPlan.id,
          feature: 'team',
          enabled: 1,
          limit: null,
        },
        {
          planId: proPlan.id,
          feature: 'priority_support',
          enabled: 1,
          limit: null,
        },
      ])
      .onConflict(oc => oc.columns(['planId', 'feature']).doNothing())
      .execute()
  }

  return { freePlan, plusPlan, proPlan }
}

async function seedAccounts(db: Database) {
  console.log('Seeding accounts...')

  const acme = await db
    .insertInto('accounts')
    .values({ name: 'Acme Corp', active: 1 })
    .onConflict(oc => oc.doNothing())
    .returning(['id'])
    .executeTakeFirst()

  const beta = await db
    .insertInto('accounts')
    .values({ name: 'Beta Corp', active: 1 })
    .onConflict(oc => oc.doNothing())
    .returning(['id'])
    .executeTakeFirst()

  return { acme, beta }
}

async function seedUsers(
  db: Database,
  accounts: { acme?: { id: number }; beta?: { id: number } }
) {
  console.log('Seeding users...')

  const hashedPassword = await hashPassword(PASSWORD)
  const users: Record<string, { id: number } | undefined> = {}

  if (accounts.acme) {
    const admin = await db
      .insertInto('users')
      .values({
        name: 'Acme Admin',
        email: 'admin@acme.repro.test',
        password: hashedPassword,
        accountId: accounts.acme.id,
        verificationToken: '',
        verified: 1,
        active: 1,
        admin: 1,
      })
      .onConflict(oc => oc.column('email').doNothing())
      .returning(['id'])
      .executeTakeFirst()

    const member = await db
      .insertInto('users')
      .values({
        name: 'Acme Member',
        email: 'member@acme.repro.test',
        password: hashedPassword,
        accountId: accounts.acme.id,
        verificationToken: '',
        verified: 1,
        active: 1,
        admin: 0,
      })
      .onConflict(oc => oc.column('email').doNothing())
      .returning(['id'])
      .executeTakeFirst()

    const viewer = await db
      .insertInto('users')
      .values({
        name: 'Acme Viewer',
        email: 'viewer@acme.repro.test',
        password: hashedPassword,
        accountId: accounts.acme.id,
        verificationToken: '',
        verified: 1,
        active: 1,
        admin: 0,
      })
      .onConflict(oc => oc.column('email').doNothing())
      .returning(['id'])
      .executeTakeFirst()

    users.acmeAdmin = admin
    users.acmeMember = member
    users.acmeViewer = viewer
  }

  if (accounts.beta) {
    const admin = await db
      .insertInto('users')
      .values({
        name: 'Beta Admin',
        email: 'admin@beta.repro.test',
        password: hashedPassword,
        accountId: accounts.beta.id,
        verificationToken: '',
        verified: 1,
        active: 1,
        admin: 1,
      })
      .onConflict(oc => oc.column('email').doNothing())
      .returning(['id'])
      .executeTakeFirst()

    const unverified = await db
      .insertInto('users')
      .values({
        name: 'Beta Unverified',
        email: 'unverified@beta.repro.test',
        password: hashedPassword,
        accountId: accounts.beta.id,
        verificationToken: 'dev_verification_token',
        verified: 0,
        active: 1,
        admin: 0,
      })
      .onConflict(oc => oc.column('email').doNothing())
      .returning(['id'])
      .executeTakeFirst()

    users.betaAdmin = admin
    users.betaUnverified = unverified
  }

  return users
}

async function seedStaffUsers(db: Database) {
  console.log('Seeding staff users...')

  const hashedPassword = await hashPassword(PASSWORD)

  await db
    .insertInto('staff_users')
    .values({
      name: 'Staff User',
      email: 'staff@repro.test',
      password: hashedPassword,
      active: 1,
      admin: 0,
    })
    .onConflict(oc => oc.column('email').doNothing())
    .execute()

  await db
    .insertInto('staff_users')
    .values({
      name: 'Staff Admin',
      email: 'staffadmin@repro.test',
      password: hashedPassword,
      active: 1,
      admin: 1,
    })
    .onConflict(oc => oc.column('email').doNothing())
    .execute()
}

async function seedProjects(
  db: Database,
  accounts: { acme?: { id: number }; beta?: { id: number } },
  users: Record<string, { id: number } | undefined>
) {
  console.log('Seeding projects...')

  if (accounts.acme) {
    const project = await db
      .insertInto('projects')
      .values({
        name: 'Default Project',
        accountId: accounts.acme.id,
        active: 1,
      })
      .onConflict(oc => oc.doNothing())
      .returning(['id'])
      .executeTakeFirst()

    if (project) {
      const memberships: Array<{
        userId: number
        projectId: number
        role: ProjectRole
      }> = []

      if (users.acmeAdmin) {
        memberships.push({
          userId: users.acmeAdmin.id,
          projectId: project.id,
          role: ProjectRole.Admin,
        })
      }

      if (users.acmeMember) {
        memberships.push({
          userId: users.acmeMember.id,
          projectId: project.id,
          role: ProjectRole.Contributor,
        })
      }

      if (users.acmeViewer) {
        memberships.push({
          userId: users.acmeViewer.id,
          projectId: project.id,
          role: ProjectRole.Viewer,
        })
      }

      if (memberships.length > 0) {
        await db
          .insertInto('memberships')
          .values(memberships)
          .onConflict(oc => oc.columns(['userId', 'projectId']).doNothing())
          .execute()
      }
    }
  }

  if (accounts.beta) {
    await db
      .insertInto('projects')
      .values({
        name: 'Default Project',
        accountId: accounts.beta.id,
        active: 1,
      })
      .onConflict(oc => oc.doNothing())
      .execute()
  }
}

async function seedBillingCustomers(
  db: Database,
  accounts: { acme?: { id: number }; beta?: { id: number } },
  plans: {
    freePlan?: { id: number }
    plusPlan?: { id: number }
  }
) {
  console.log('Seeding billing customers and subscriptions...')

  const now = new Date()
  const periodEnd = new Date(now)
  periodEnd.setMonth(periodEnd.getMonth() + 1)

  if (accounts.acme) {
    await db
      .insertInto('billing_customers')
      .values({
        accountId: accounts.acme.id,
        providerCustomerId: 'dev_cus_acme',
      })
      .onConflict(oc => oc.column('accountId').doNothing())
      .execute()

    if (plans.freePlan) {
      await db
        .insertInto('billing_subscriptions')
        .values({
          accountId: accounts.acme.id,
          providerSubscriptionId: 'dev_sub_acme',
          planId: plans.freePlan.id,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: 0,
          canceledAt: null,
        })
        .onConflict(oc => oc.column('providerSubscriptionId').doNothing())
        .execute()
    }
  }

  if (accounts.beta) {
    await db
      .insertInto('billing_customers')
      .values({
        accountId: accounts.beta.id,
        providerCustomerId: 'dev_cus_beta',
      })
      .onConflict(oc => oc.column('accountId').doNothing())
      .execute()

    if (plans.plusPlan) {
      await db
        .insertInto('billing_subscriptions')
        .values({
          accountId: accounts.beta.id,
          providerSubscriptionId: 'dev_sub_beta',
          planId: plans.plusPlan.id,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: 0,
          canceledAt: null,
        })
        .onConflict(oc => oc.column('providerSubscriptionId').doNothing())
        .execute()
    }
  }
}

async function seedFeatureGates(db: Database) {
  console.log('Seeding feature gates...')

  await db
    .insertInto('feature_gates')
    .values({
      name: 'legacy-report-form',
      description: 'Enable the legacy report form UI',
      enabled: 0,
    })
    .onConflict(oc => oc.column('name').doNothing())
    .execute()
}

export async function seed(db: Database, storage: Storage) {
  const plans = await seedBillingPlans(db)
  const accounts = await seedAccounts(db)
  const users = await seedUsers(db, accounts)
  await seedStaffUsers(db)
  await seedProjects(db, accounts, users)
  await seedBillingCustomers(db, accounts, plans)
  await seedFeatureGates(db)
  await seedRecordings(db, storage)

  console.log('Seed complete.')
}

async function main() {
  const db = createPostgresDatabaseClient({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL,
  })

  const storage = createS3StorageClient({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    bucket: env.STORAGE_BUCKET,
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  })

  try {
    await seed(db, storage)
  } catch (error) {
    console.error('Seed failed:', error)
    process.exit(1)
  } finally {
    await db.destroy()
  }
}

if (process.argv[1] === import.meta.filename) {
  main()
}
