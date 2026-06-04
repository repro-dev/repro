import * as argon2 from '@node-rs/argon2'
import { ProjectRole } from '@repro/domain'
import { fileURLToPath } from 'node:url'
import { defaultEnv as env } from '~/config/env'
import { sandboxPlanConfig, seedPlans } from '~/modules/billing'
import { createPostgresDatabaseClient } from '~/modules/database/database-postgres'
import { Database } from '~/modules/database/types'
import { Storage } from '~/modules/storage'
import { createS3StorageClient } from '~/modules/storage-s3'
import {
  type AuthVaultBootstrapLogin,
  loadAuthVaultBootstrap,
} from './auth-vault-bootstrap'
import { seedRecordings } from './seed-recordings'

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
      .values({ name, active: true, recordingPrivacyPreset: 'standard' })
      .returning(['id'])
      .executeTakeFirstOrThrow()
  }

  const acme = await findOrCreateAccount('Acme Corp')
  const beta = await findOrCreateAccount('Beta Corp')

  return { acme, beta }
}

function accountForLogin(
  login: AuthVaultBootstrapLogin,
  accounts: { acme: { id: number }; beta: { id: number } }
) {
  if (login.account === 'acme') {
    return accounts.acme
  }

  if (login.account === 'beta') {
    return accounts.beta
  }

  throw new Error(
    `Auth vault bootstrap login ${login.profile} is missing an account`
  )
}

function requireSeededUser(
  usersByProfile: Map<string, { id: number }>,
  profile: string
) {
  const user = usersByProfile.get(profile)

  if (!user) {
    throw new Error(`Auth vault bootstrap login ${profile} was not seeded`)
  }

  return user
}

async function seedUsers(
  db: Database,
  accounts: { acme: { id: number }; beta: { id: number } },
  logins: AuthVaultBootstrapLogin[],
  password: string
) {
  console.log('Seeding users...')

  const hashedPassword = await hashPassword(password)

  async function upsertUser(values: {
    name: string
    email: string
    password: string
    accountId: number
    verificationToken: string
    verified: boolean
    active: boolean
    admin: boolean
  }) {
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

  const seededUsers = new Map<string, { id: number }>()

  for (const login of logins) {
    if (login.target !== 'users') {
      continue
    }

    const account = accountForLogin(login, accounts)

    seededUsers.set(
      login.profile,
      await upsertUser({
        name: login.name,
        email: login.username,
        password: hashedPassword,
        accountId: account.id,
        verificationToken: login.verificationToken ?? '',
        verified: login.verified ?? false,
        active: login.active,
        admin: login.admin,
      })
    )
  }

  return {
    acmeAdmin: requireSeededUser(seededUsers, 'acme-admin'),
    acmeMember: requireSeededUser(seededUsers, 'acme-member'),
    acmeViewer: requireSeededUser(seededUsers, 'acme-viewer'),
    betaAdmin: requireSeededUser(seededUsers, 'beta-admin'),
    betaUnverified: requireSeededUser(seededUsers, 'beta-unverified'),
  }
}

async function seedStaffUsers(
  db: Database,
  logins: AuthVaultBootstrapLogin[],
  password: string
) {
  console.log('Seeding staff users...')

  const hashedPassword = await hashPassword(password)

  for (const login of logins) {
    if (login.target !== 'staff_users') {
      continue
    }

    await db
      .insertInto('staff_users')
      .values({
        name: login.name,
        email: login.username,
        password: hashedPassword,
        active: login.active,
        admin: login.admin,
      })
      .onConflict(oc => oc.column('email').doNothing())
      .execute()
  }
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
  const acmeProject2 = await findOrCreateProject(
    'Marketing Site',
    accounts.acme.id
  )
  const acmeProject3 = await findOrCreateProject('Mobile App', accounts.acme.id)

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
      {
        userId: users.acmeAdmin.id,
        projectId: acmeProject2.id,
        role: ProjectRole.Admin,
      },
      {
        userId: users.acmeMember.id,
        projectId: acmeProject2.id,
        role: ProjectRole.Contributor,
      },
      {
        userId: users.acmeAdmin.id,
        projectId: acmeProject3.id,
        role: ProjectRole.Admin,
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
  const { logins, password } = loadAuthVaultBootstrap()

  await doSeedBillingPlans(db)
  const accounts = await seedAccounts(db)
  const users = await seedUsers(db, accounts, logins, password)
  await seedStaffUsers(db, logins, password)
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
