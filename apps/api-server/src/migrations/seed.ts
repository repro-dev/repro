import * as argon2 from '@node-rs/argon2'
import { ProjectRole } from '@repro/domain'
import { fileURLToPath } from 'node:url'
import { defaultEnv as env } from '~/config/env'
import { createPostgresDatabaseClient } from '~/modules/database/database-postgres'
import { Database } from '~/modules/database/types'
import { sandboxPlanConfig, seedPlans } from '~/modules/billing'
import { Storage } from '~/modules/storage'
import { createS3StorageClient } from '~/modules/storage-s3'
import { seedRecordings } from './seed-recordings'

const PASSWORD = 'password'

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password)
}

async function doSeedBillingPlans(db: Database) {
  console.log('Seeding billing plans...')
  await seedPlans(db, sandboxPlanConfig)
}

async function seedAccounts(db: Database) {
  console.log('Seeding accounts...')

  async function findOrCreateAccount(name: string) {
    const existing = await db
      .selectFrom('accounts')
      .select('id')
      .where('name', '=', name)
      .executeTakeFirst()

    if (existing) {
      return existing
    }

    return db
      .insertInto('accounts')
      .values({ name, active: true })
      .returning(['id'])
      .executeTakeFirstOrThrow()
  }

  const acme = await findOrCreateAccount('Acme Corp')
  const beta = await findOrCreateAccount('Beta Corp')

  return { acme, beta }
}

async function seedUsers(
  db: Database,
  accounts: { acme: { id: number }; beta: { id: number } }
) {
  console.log('Seeding users...')

  const hashedPassword = await hashPassword(PASSWORD)

  async function upsertUser(
    values: {
      name: string
      email: string
      password: string
      accountId: number
      verificationToken: string
      verified: boolean
      active: boolean
      admin: boolean
    }
  ) {
    const inserted = await db
      .insertInto('users')
      .values(values)
      .onConflict(oc => oc.column('email').doNothing())
      .returning(['id'])
      .executeTakeFirst()

    if (inserted) {
      return inserted
    }

    return db
      .selectFrom('users')
      .select('id')
      .where('email', '=', values.email)
      .executeTakeFirstOrThrow()
  }

  const acmeAdmin = await upsertUser({
    name: 'Acme Admin',
    email: 'admin@acme.repro.test',
    password: hashedPassword,
    accountId: accounts.acme.id,
    verificationToken: '',
    verified: true,
    active: true,
    admin: true,
  })

  const acmeMember = await upsertUser({
    name: 'Acme Member',
    email: 'member@acme.repro.test',
    password: hashedPassword,
    accountId: accounts.acme.id,
    verificationToken: '',
    verified: true,
    active: true,
    admin: false,
  })

  const acmeViewer = await upsertUser({
    name: 'Acme Viewer',
    email: 'viewer@acme.repro.test',
    password: hashedPassword,
    accountId: accounts.acme.id,
    verificationToken: '',
    verified: true,
    active: true,
    admin: false,
  })

  const betaAdmin = await upsertUser({
    name: 'Beta Admin',
    email: 'admin@beta.repro.test',
    password: hashedPassword,
    accountId: accounts.beta.id,
    verificationToken: '',
    verified: true,
    active: true,
    admin: true,
  })

  const betaUnverified = await upsertUser({
    name: 'Beta Unverified',
    email: 'unverified@beta.repro.test',
    password: hashedPassword,
    accountId: accounts.beta.id,
    verificationToken: 'dev_verification_token',
    verified: false,
    active: true,
    admin: false,
  })

  return { acmeAdmin, acmeMember, acmeViewer, betaAdmin, betaUnverified }
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
      active: true,
      admin: false,
    })
    .onConflict(oc => oc.column('email').doNothing())
    .execute()

  await db
    .insertInto('staff_users')
    .values({
      name: 'Staff Admin',
      email: 'staffadmin@repro.test',
      password: hashedPassword,
      active: true,
      admin: true,
    })
    .onConflict(oc => oc.column('email').doNothing())
    .execute()
}

async function seedProjects(
  db: Database,
  accounts: { acme: { id: number }; beta: { id: number } },
  users: {
    acmeAdmin: { id: number }
    acmeMember: { id: number }
    acmeViewer: { id: number }
  }
) {
  console.log('Seeding projects...')

  async function findOrCreateProject(name: string, accountId: number) {
    const existing = await db
      .selectFrom('projects')
      .select('id')
      .where('accountId', '=', accountId)
      .where('name', '=', name)
      .executeTakeFirst()

    if (existing) {
      return existing
    }

    return db
      .insertInto('projects')
      .values({ name, accountId, active: true })
      .returning(['id'])
      .executeTakeFirstOrThrow()
  }

  const acmeProject = await findOrCreateProject(
    'Default Project',
    accounts.acme.id
  )

  await db
    .insertInto('memberships')
    .values([
      {
        userId: users.acmeAdmin.id,
        projectId: acmeProject.id,
        role: ProjectRole.Admin,
      },
      {
        userId: users.acmeMember.id,
        projectId: acmeProject.id,
        role: ProjectRole.Contributor,
      },
      {
        userId: users.acmeViewer.id,
        projectId: acmeProject.id,
        role: ProjectRole.Viewer,
      },
    ])
    .onConflict(oc => oc.columns(['userId', 'projectId']).doNothing())
    .execute()

  await findOrCreateProject('Default Project', accounts.beta.id)
}

async function seedBillingCustomers(
  db: Database,
  accounts: { acme: { id: number }; beta: { id: number } }
) {
  console.log('Seeding billing customers and subscriptions...')

  const freePlan = await db
    .selectFrom('billing_plans')
    .select('id')
    .where('providerPriceId', '=', 'pri_sandbox_free_month')
    .executeTakeFirstOrThrow()

  const plusPlan = await db
    .selectFrom('billing_plans')
    .select('id')
    .where('providerPriceId', '=', 'pri_sandbox_plus_month')
    .executeTakeFirstOrThrow()

  const now = new Date()
  const periodEnd = new Date(now)
  periodEnd.setMonth(periodEnd.getMonth() + 1)

  await db
    .insertInto('billing_customers')
    .values({
      accountId: accounts.acme.id,
      providerCustomerId: 'dev_cus_acme',
    })
    .onConflict(oc => oc.column('accountId').doNothing())
    .execute()

  await db
    .insertInto('billing_subscriptions')
    .values({
      accountId: accounts.acme.id,
      providerSubscriptionId: 'dev_sub_acme',
      planId: freePlan.id,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    })
    .onConflict(oc => oc.column('providerSubscriptionId').doNothing())
    .execute()

  await db
    .insertInto('billing_customers')
    .values({
      accountId: accounts.beta.id,
      providerCustomerId: 'dev_cus_beta',
    })
    .onConflict(oc => oc.column('accountId').doNothing())
    .execute()

  await db
    .insertInto('billing_subscriptions')
    .values({
      accountId: accounts.beta.id,
      providerSubscriptionId: 'dev_sub_beta',
      planId: plusPlan.id,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    })
    .onConflict(oc => oc.column('providerSubscriptionId').doNothing())
    .execute()
}

async function seedFeatureGates(db: Database) {
  console.log('Seeding feature gates...')

  await db
    .insertInto('feature_gates')
    .values({
      name: 'legacy-report-form',
      description: 'Enable the legacy report form UI',
      enabled: false,
    })
    .onConflict(oc => oc.column('name').doNothing())
    .execute()
}

export async function seed(db: Database, storage: Storage) {
  await doSeedBillingPlans(db)
  const accounts = await seedAccounts(db)
  const users = await seedUsers(db, accounts)
  await seedStaffUsers(db)
  await seedProjects(db, accounts, users)
  await seedBillingCustomers(db, accounts)
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
