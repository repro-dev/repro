import * as argon2 from '@node-rs/argon2'
import { StaffUser, User } from '@repro/domain'
import { addMinutes } from 'date-fns'
import {
  FutureInstance,
  alt,
  and,
  ap,
  chain,
  map,
  reject,
  resolve,
  swap,
} from 'fluture'
import { sql } from 'kysely'
import { createHash, randomBytes } from 'node:crypto'
import { SystemConfig, defaultSystemConfig } from '~/config/system'
import {
  Database,
  asStaffUser,
  asStaffUserDetail,
  asUser,
  attemptQuery,
  decodeId,
  encodeId,
  withEncodedId,
} from '~/modules/database'
import { EmailUtils } from '~/modules/email-utils'
import { BillingService } from '~/services/billing'
import {
  badRequest,
  notFound,
  permissionDenied,
  resourceConflict,
  tooManyRequests,
} from '~/utils/errors'

// Used for password comparison in the case of
// a login attempt for a non-existent user.
// For better resilience against timing attacks.
const DUMMY_HASH =
  '$argon2id$v=19$m=4096,t=3,p=1$YWJjZDEyMzQ$MFRSPmdxZVyBvGi95RcZlo5PqmfJhLXYj8JZm8atFdY'

function createToken(): string {
  return randomBytes(32).toString('base64url')
}

// SHA-256 hash of a session token for safe database storage.
// Session lookup is on every request — use a fast hash, not argon2.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export function createAccountService(
  database: Database,
  emailUtils: EmailUtils,
  billingService?: BillingService,
  sessionHardExpirySeconds: number = 28 * 24 * 3600,
  _config: SystemConfig = defaultSystemConfig
) {
  function ensureStaffUser(user: User | StaffUser | null): FutureInstance {
    return user != null && user.type === 'staff'
      ? getStaffUserById(user.id)
      : reject(permissionDenied())
  }

  function ensureStaffUserIsAdmin(
    user: User | StaffUser | null
  ): FutureInstance {
    if (user == null) {
      return reject(permissionDenied())
    }

    return ensureStaffUser(user).pipe(
      chain(user =>
        getStaffUserIsAdmin(user.id).pipe(
          chain(isAdmin =>
            isAdmin ? resolve(user) : reject(permissionDenied())
          )
        )
      )
    )
  }

  function ensureUser(user: User | StaffUser | null): FutureInstance {
    return user != null && user.type === 'user'
      ? getUserById(user.id)
      : reject(permissionDenied())
  }

  function ensureUserIsAdmin(user: User | StaffUser | null): FutureInstance {
    if (user == null) {
      return reject(permissionDenied())
    }

    return ensureUser(user).pipe(
      chain(user =>
        getUserIsAdmin(user.id).pipe(
          chain(isAdmin =>
            isAdmin ? resolve(user) : reject(permissionDenied())
          )
        )
      )
    )
  }

  function ensureUserMatchesEmail(
    user: User | StaffUser | null,
    email: string
  ): FutureInstance {
    if (user == null) {
      return reject(permissionDenied())
    }

    return ensureUser(user).pipe(
      chain(user =>
        getUserByEmail(email).pipe(
          chain(targetUser =>
            user.id === targetUser.id
              ? resolve(user)
              : reject(permissionDenied())
          )
        )
      )
    )
  }

  function ensureCanModifyStaffUser(
    actor: User | StaffUser | null,
    _subjectStaffUserId: string
  ): FutureInstance {
    return ensureStaffUserIsAdmin(actor)
  }

  function ensureCanAccessAccount(
    actor: User | StaffUser | null,
    subjectAccountId: string
  ): FutureInstance {
    if (actor == null) {
      return reject(permissionDenied())
    }

    return alt(
      ensureUser(actor).pipe(
        chain(user => {
          return getAccountForUser(actor.id).pipe(
            chain(account =>
              account.id === subjectAccountId
                ? resolve(user)
                : reject(permissionDenied())
            )
          )
        })
      )
    )(ensureStaffUser(actor))
  }

  function ensureCanModifyAccount(
    actor: User | StaffUser | null,
    subjectAccountId: string
  ): FutureInstance {
    return alt(
      and(ensureCanAccessAccount(actor, subjectAccountId))(
        ensureUserIsAdmin(actor)
      )
    )(ensureStaffUser(actor))
  }

  function ensureCanAccessUser(
    actor: User | StaffUser | null,
    subjectUserId: string
  ): FutureInstance {
    if (actor == null) {
      return reject(permissionDenied())
    }

    const ensureSameAccount = ap(getAccountForUser(actor.id))(
      ap(getAccountForUser(subjectUserId))(
        resolve(
          actorAccount => subjectAccount =>
            actorAccount.id === subjectAccount.id
        )
      )
    ).pipe(
      chain(isSameAccount =>
        isSameAccount ? resolve(actor) : reject(permissionDenied())
      )
    )

    return alt(ensureSameAccount)(ensureStaffUser(actor))
  }

  function ensureCanModifyUser(
    actor: User | StaffUser | null,
    subjectUserId: string
  ): FutureInstance {
    if (actor == null) {
      return reject(permissionDenied())
    }

    return alt(
      alt(
        and(ensureUserIsAdmin(actor))(ensureCanAccessUser(actor, subjectUserId))
      )(
        actor.id === subjectUserId
          ? ensureUser(actor)
          : reject(permissionDenied())
      )
    )(ensureStaffUser(actor))
  }

  function createStaffUser(
    name: string,
    email: string,
    password: string
  ): FutureInstance {
    const existingStaffUser = attemptQuery(async () => {
      return database
        .selectFrom('staff_users')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirstOrThrow()
    })
      .pipe(map(() => resourceConflict()))
      .pipe(swap)

    return existingStaffUser.pipe(
      chain(() =>
        attemptQuery(async () => {
          return database
            .insertInto('staff_users')
            .values({
              name,
              email,
              password: await argon2.hash(password),
            })
            .returning(['id', 'name', 'email', 'admin'])
            .executeTakeFirstOrThrow()
        }).pipe(map(asStaffUser))
      )
    )
  }

  function getStaffUserIsAdmin(staffUserId: string): FutureInstance {
    return attemptQuery(() => {
      return database
        .selectFrom('staff_users')
        .select('admin')
        .where('id', '=', decodeId(staffUserId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(row => row.admin))
  }

  function getStaffUserByEmailAndPassword(
    email: string,
    password: string
  ): FutureInstance {
    return attemptQuery(async () => {
      const row = await database
        .selectFrom('staff_users')
        .select(['id', 'name', 'email', 'admin', 'password'])
        .where('email', '=', email.toLowerCase())
        .where('active', '=', true)
        .executeTakeFirst()

      // Run password verification even if user record is not
      // found to prevent timing attacks
      const verified = await argon2.verify(
        row?.password ?? DUMMY_HASH,
        password
      )

      if (!row || !verified) {
        throw notFound()
      }

      return row
    }).pipe(map(asStaffUser))
  }

  function getStaffUserById(staffUserId: string): FutureInstance {
    return attemptQuery(() =>
      database
        .selectFrom('staff_users')
        .select(['id', 'name', 'email', 'admin'])
        .where('id', '=', decodeId(staffUserId))
        .where('active', '=', true)
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(asStaffUser))
  }

  function getStaffUserByEmail(email: string): FutureInstance {
    return attemptQuery(() =>
      database
        .selectFrom('staff_users')
        .select(['id', 'name', 'email', 'admin'])
        .where('email', '=', email.toLowerCase())
        .where('active', '=', true)
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(asStaffUser))
  }

  function updateStaffUserName(
    staffUserId: string,
    name: string
  ): FutureInstance {
    return getStaffUserById(staffUserId).pipe(
      chain(() =>
        attemptQuery(async () => {
          await database
            .updateTable('staff_users')
            .set('name', name)
            .where('id', '=', decodeId(staffUserId))
            .execute()
        })
      )
    )
  }

  function deactivateStaffUser(staffUserId: string): FutureInstance {
    return getStaffUserById(staffUserId).pipe(
      chain(() =>
        attemptQuery(async () => {
          await database
            .updateTable('staff_users')
            .set('active', false)
            .where('id', '=', decodeId(staffUserId))
            .execute()
        })
      )
    )
  }

  function createAccount(name: string): FutureInstance {
    return attemptQuery(() => {
      return database
        .insertInto('accounts')
        .values({ name, active: true })
        .returning(['id', 'name'])
        .executeTakeFirstOrThrow()
    })
      .pipe(map(withEncodedId))
      .pipe(
        chain(account => {
          if (!billingService) {
            return resolve(account)
          }

          return billingService
            .provisionFreeSubscription(account.id)
            .pipe(map(() => account))
        })
      )
  }

  function getAccountById(accountId: string): FutureInstance {
    return attemptQuery(() => {
      return database
        .selectFrom('accounts')
        .select(['id', 'name'])
        .where('id', '=', decodeId(accountId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(withEncodedId))
  }

  function getAccountForUser(userId: string): FutureInstance {
    return attemptQuery(() => {
      return database
        .selectFrom('users as u')
        .innerJoin('accounts as a', 'a.id', 'u.accountId')
        .select(['a.id', 'a.name'])
        .where('u.id', '=', decodeId(userId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(withEncodedId))
  }

  function getAccountForInvitation(invitationId: string): FutureInstance {
    return attemptQuery(() => {
      return database
        .selectFrom('invitations as i')
        .innerJoin('accounts as a', 'a.id', 'i.accountId')
        .select(['a.id', 'a.name'])
        .where('i.id', '=', decodeId(invitationId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(withEncodedId))
  }

  // Map billing plan names to AccountPlan type
  function mapPlanName(name: string | null): AccountPlan | null {
    if (name == null) return null
    const normalized = name.toLowerCase()
    if (normalized === 'free') return 'free'
    if (normalized === 'repro+') return 'starter'
    if (normalized === 'repro++') return 'pro'
    if (normalized === 'enterprise') return 'enterprise'
    return null
  }

  // Raw row type for enriched account query
  interface StaffAccountRow {
    id: number
    name: string
    createdAt: Date
    email: string | null
    planName: string | null
    lastActiveAt: Date | null
    userCount: number
    recordingCount: number
  }

  function asStaffAccount(row: StaffAccountRow): StaffAccount {
    return {
      id: encodeId(row.id),
      name: row.name,
      email: row.email ?? '',
      plan: mapPlanName(row.planName),
      createdAt: row.createdAt.toISOString(),
      lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
      userCount: Number(row.userCount),
      recordingCount: Number(row.recordingCount),
    }
  }

  function listAccounts({
    cursor,
    limit = 50,
    order = 'desc',
    search,
    plan,
  }: {
    cursor?: string
    limit?: number
    order?: 'asc' | 'desc'
    search?: string
    plan?: AccountPlan
  } = {}): FutureInstance {
    return attemptQuery(async () => {
      // Get accounts with pagination
      let query = database
        .selectFrom('accounts')
        .select(['id', 'name', 'createdAt'])
        .orderBy(`id ${order}`)
        .limit(limit + 1)

      if (cursor != null) {
        query = query.where('id', order === 'asc' ? '>' : '<', decodeId(cursor))
      }

      const rows = await query.execute()
      const hasMore = rows.length > limit
      const pageRows = hasMore ? rows.slice(0, limit) : rows

      // Get account IDs to enrich
      const accountIds = pageRows.map(row => row.id)

      if (accountIds.length === 0) {
        return { items: [], nextCursor: undefined }
      }

      // Get enrichment data for these accounts
      const [userCounts, recordingCounts, emails, plans, lastActiveDates] =
        await Promise.all([
          // User counts per account
          database
            .selectFrom('users')
            .select(['accountId'])
            .where('accountId', 'in', accountIds)
            .execute(),
          // Recording counts per account (via project_recordings -> projects)
          database
            .selectFrom('project_recordings as pr')
            .innerJoin('projects as p', 'p.id', 'pr.projectId')
            .select(['p.accountId'])
            .where('p.accountId', 'in', accountIds)
            .execute(),
          // First user email per account
          database
            .selectFrom('users')
            .select(['accountId', 'email'])
            .where('accountId', 'in', accountIds)
            .execute(),
          // Plan names per account
          database
            .selectFrom('billing_subscriptions')
            .innerJoin(
              'billing_plans',
              'billing_plans.id',
              'billing_subscriptions.planId'
            )
            .select(['billing_subscriptions.accountId', 'billing_plans.name'])
            .where('billing_subscriptions.accountId', 'in', accountIds)
            .execute(),
          // Last active date per account (max createdAt of users)
          database
            .selectFrom('users')
            .select(['accountId', 'createdAt'])
            .where('accountId', 'in', accountIds)
            .execute(),
        ])

      // Aggregate user counts
      const userCountMap = new Map()
      for (const row of userCounts) {
        userCountMap.set(
          row.accountId,
          (userCountMap.get(row.accountId) ?? 0) + 1
        )
      }

      // Aggregate recording counts
      const recordingCountMap = new Map()
      for (const row of recordingCounts) {
        recordingCountMap.set(
          row.accountId,
          (recordingCountMap.get(row.accountId) ?? 0) + 1
        )
      }

      // Get first email per account
      const emailMap = new Map()
      for (const row of emails) {
        if (!emailMap.has(row.accountId)) {
          emailMap.set(row.accountId, row.email)
        }
      }

      // Get plan per account (most recent subscription)
      const planMap = new Map()
      for (const row of plans) {
        if (!planMap.has(row.accountId)) {
          planMap.set(row.accountId, row.name)
        }
      }

      // Get last active per account (max createdAt)
      const lastActiveMap = new Map()
      for (const row of lastActiveDates) {
        const current = lastActiveMap.get(row.accountId)
        if (!current || row.createdAt > current) {
          lastActiveMap.set(row.accountId, row.createdAt)
        }
      }

      // Build enriched accounts
      let items = pageRows.map(row =>
        asStaffAccount({
          id: row.id,
          name: row.name,
          createdAt: row.createdAt,
          email: emailMap.get(row.id) ?? null,
          planName: planMap.get(row.id) ?? null,
          lastActiveAt: lastActiveMap.get(row.id) ?? null,
          userCount: userCountMap.get(row.id) ?? 0,
          recordingCount: recordingCountMap.get(row.id) ?? 0,
        })
      )

      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase()
        items = items.filter(
          item =>
            item.email.toLowerCase().includes(searchLower) ||
            item.name.toLowerCase().includes(searchLower) ||
            item.id.toLowerCase().includes(searchLower)
        )
      }

      // Apply plan filter
      if (plan) {
        items = items.filter(item => item.plan === plan)
      }

      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined
      return { items, nextCursor }
    })
  }

  function getStaffAccountById(accountId: string): FutureInstance {
    return attemptQuery(async () => {
      const decodedId = decodeId(accountId)
      if (decodedId == null) {
        throw notFound()
      }

      // Get account
      const account = await database
        .selectFrom('accounts')
        .select(['id', 'name', 'createdAt'])
        .where('id', '=', decodedId)
        .executeTakeFirstOrThrow(() => notFound())

      // Get enrichment data in parallel
      const [userCounts, recordingCounts, emails, plans, lastActiveDates] =
        await Promise.all([
          database
            .selectFrom('users')
            .select(['accountId'])
            .where('accountId', '=', decodedId)
            .execute(),
          database
            .selectFrom('project_recordings as pr')
            .innerJoin('projects as p', 'p.id', 'pr.projectId')
            .where('p.accountId', '=', decodedId)
            .execute(),
          database
            .selectFrom('users')
            .select(['email'])
            .where('accountId', '=', decodedId)
            .execute(),
          database
            .selectFrom('billing_subscriptions')
            .innerJoin(
              'billing_plans',
              'billing_plans.id',
              'billing_subscriptions.planId'
            )
            .select(['billing_plans.name'])
            .where('billing_subscriptions.accountId', '=', decodedId)
            .execute(),
          database
            .selectFrom('users')
            .select(['createdAt'])
            .where('accountId', '=', decodedId)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .execute(),
        ])

      const userCount = userCounts.length
      const recordingCount = recordingCounts.length
      const email = emails[0]?.email ?? ''
      const planName = plans[0]?.name ?? null
      const lastActiveAt = lastActiveDates[0]?.createdAt ?? null

      return asStaffAccount({
        id: account.id,
        name: account.name,
        createdAt: account.createdAt,
        email,
        planName,
        lastActiveAt,
        userCount,
        recordingCount,
      })
    })
  }

  function listProjectsForAccount(
    accountId: string,
    {
      cursor,
      limit = 50,
    }: {
      cursor?: string
      limit?: number
    } = {}
  ): FutureInstance {
    return attemptQuery(() => {
      let query = database
        .selectFrom('projects')
        .select(['id', 'name'])
        .where('accountId', '=', decodeId(accountId))
        .orderBy('id asc')
        .limit(limit + 1)

      if (cursor != null) {
        query = query.where('id', '>', decodeId(cursor))
      }

      return query.execute()
    }).pipe(
      map(rows => {
        const hasMore = rows.length > limit
        const pageRows = hasMore ? rows.slice(0, limit) : rows
        const items = pageRows.map(withEncodedId) as Project[]
        const nextCursor = hasMore ? items[items.length - 1]?.id : undefined
        return { items, nextCursor }
      })
    )
  }

  function listUsersForAccount(
    accountId: string,
    {
      cursor,
      limit = 50,
    }: {
      cursor?: string
      limit?: number
    } = {}
  ): FutureInstance {
    return attemptQuery(() => {
      let query = database
        .selectFrom('users')
        .select(['id', 'name', 'email', 'verified'])
        .where('accountId', '=', decodeId(accountId))
        .where('active', '=', true)
        .orderBy('id asc')
        .limit(limit + 1)

      if (cursor != null) {
        query = query.where('id', '>', decodeId(cursor))
      }

      return query.execute()
    }).pipe(
      map(rows => {
        const hasMore = rows.length > limit
        const pageRows = hasMore ? rows.slice(0, limit) : rows
        const items = pageRows.map(asStaffUserDetail)
        const nextCursor = hasMore ? items[items.length - 1]?.id : undefined
        return { items, nextCursor }
      })
    )
  }

  function updateAccountName(accountId: string, name: string): FutureInstance {
    return getAccountById(accountId).pipe(
      chain(() =>
        attemptQuery(async () => {
          await database
            .updateTable('accounts')
            .set('name', name)
            .where('id', '=', decodeId(accountId))
            .execute()
        })
      )
    )
  }

  function createInvitation(accountId: string, email: string): FutureInstance {
    const decodedAccountId = decodeId(accountId)

    if (decodedAccountId == null) {
      return reject(badRequest('Invalid account ID'))
    }

    const token = createToken()

    return attemptQuery(() => {
      return database
        .insertInto('invitations')
        .values({
          token,
          email,
          accountId: decodedAccountId,
        })
        .onConflict(cb =>
          cb.column('email').doUpdateSet({ token, active: true })
        )
        .returning(['id', 'token', 'email'])
        .executeTakeFirstOrThrow()
    }).pipe(map(withEncodedId))
  }

  function getInvitationById(invitationId: string): FutureInstance {
    return attemptQuery(() => {
      return database
        .selectFrom('invitations')
        .select(['id', 'token', 'email'])
        .where('id', '=', decodeId(invitationId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(withEncodedId))
  }

  function getInvitationByTokenAndEmail(
    token: string,
    email: string
  ): FutureInstance {
    return attemptQuery(() => {
      return database
        .selectFrom('invitations')
        .select(['id', 'token', 'email'])
        .where('token', '=', token)
        .where('email', '=', email)
        .where('active', '=', true)
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(withEncodedId))
  }

  function deactivateInvitation(invitationId: string): FutureInstance {
    return getInvitationById(invitationId).pipe(
      chain(() =>
        attemptQuery(async () => {
          await database
            .updateTable('invitations')
            .set('active', false)
            .where('id', '=', decodeId(invitationId))
            .execute()
        })
      )
    )
  }

  function createUser(
    accountId: string,
    name: string,
    email: string,
    password: string
  ): FutureInstance {
    const decodedAccountId = decodeId(accountId)

    if (decodedAccountId == null) {
      return reject(badRequest('Invalid account ID'))
    }

    const existingUser = attemptQuery(async () => {
      return database
        .selectFrom('users')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirstOrThrow()
    })
      .pipe(map(() => resourceConflict()))
      .pipe(swap)

    return existingUser.pipe(
      chain(() =>
        attemptQuery(async () => {
          return database
            .insertInto('users')
            .values({
              name,
              email,
              password: await argon2.hash(password),
              accountId: decodedAccountId,
              verificationToken: '',
            })
            .returning(['id', 'name', 'email', 'verified'])
            .executeTakeFirstOrThrow()
        }).pipe(map(asUser))
      )
    )
  }

  function getUserIsAdmin(userId: string): FutureInstance {
    return attemptQuery(() => {
      return database
        .selectFrom('users')
        .select('admin')
        .where('id', '=', decodeId(userId))
        .executeTakeFirstOrThrow()
    }).pipe(map(row => row.admin))
  }

  function setUserIsAdmin(userId: string, admin: boolean): FutureInstance {
    return getUserById(userId).pipe(
      chain(() =>
        attemptQuery(async () => {
          await database
            .updateTable('users')
            .set('admin', admin)
            .where('id', '=', decodeId(userId))
            .execute()
        })
      )
    )
  }

  function updateUserName(userId: string, name: string): FutureInstance {
    return attemptQuery(async () => {
      await database
        .updateTable('users')
        .set('name', name)
        .where('id', '=', decodeId(userId))
        .execute()
    })
  }

  function getUserById(id: string): FutureInstance {
    return attemptQuery(() =>
      database
        .selectFrom('users')
        .select(['id', 'name', 'email', 'verified'])
        .where('id', '=', decodeId(id))
        .where('active', '=', true)
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(asUser))
  }

  // Staff-facing variant that includes email in the response
  function getUserByIdForStaff(id: string): FutureInstance {
    return attemptQuery(() =>
      database
        .selectFrom('users')
        .select(['id', 'name', 'email', 'verified'])
        .where('id', '=', decodeId(id))
        .where('active', '=', true)
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(asStaffUserDetail))
  }

  function getUserEmailById(id: string): FutureInstance {
    return attemptQuery(() =>
      database
        .selectFrom('users')
        .select(['email'])
        .where('id', '=', decodeId(id))
        .where('active', '=', true)
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(row => row.email))
  }

  function getUserByEmail(email: string): FutureInstance {
    return attemptQuery(async () => {
      return database
        .selectFrom('users')
        .select(['id', 'name', 'email', 'verified'])
        .where('email', '=', email.toLowerCase())
        .where('active', '=', true)
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(asUser))
  }

  function getUserByEmailAndPassword(
    email: string,
    password: string
  ): FutureInstance {
    return attemptQuery(async () => {
      const row = await database
        .selectFrom('users')
        .select(['id', 'name', 'email', 'password', 'verified'])
        .where('email', '=', email.toLowerCase())
        .where('active', '=', true)
        .executeTakeFirst()

      // Run password verification even if user record is not
      // found to prevent timing attacks
      const verified = await argon2.verify(
        row?.password ?? DUMMY_HASH,
        password
      )

      if (!row || !verified) {
        throw notFound()
      }

      return row
    }).pipe(map(asUser))
  }

  function deactivateUser(userId: string): FutureInstance {
    return attemptQuery(async () => {
      await database
        .updateTable('users')
        .set('active', false)
        .where('id', '=', decodeId(userId))
        .execute()
    })
  }

  function sendVerificationEmail(userId: string): FutureInstance {
    const result = attemptQuery(async () => {
      return database
        .selectFrom('users')
        .select(['email', 'verificationToken'])
        .where('id', '=', decodeId(userId))
        .executeTakeFirstOrThrow(() => notFound())
    })

    return result.pipe(
      chain(({ email, verificationToken }) =>
        emailUtils.send({
          to: email,
          from: emailUtils.getAddress('no-reply'),
          subject: 'Verify email for your Repro account',
          template: 'send-verification',
          params: {
            verificationToken,
          },
        })
      )
    )
  }

  function verifyUser(
    verificationToken: string,
    email: string
  ): FutureInstance {
    return getUserByEmail(email).pipe(
      chain(() =>
        attemptQuery(async () => {
          await database
            .updateTable('users')
            .set('verified', true)
            .where('email', '=', email)
            .where('verificationToken', '=', verificationToken)
            .executeTakeFirst()
        })
      )
    )
  }

  const MAX_FAILED_ATTEMPTS = 5
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000

  function ensureEmailNotLocked(
    getLockoutState: (normalizedEmail: string) => Promise,
    email: string
  ): FutureInstance {
    return attemptQuery(() => getLockoutState(email.toLowerCase())).pipe(
      chain(row => {
        if (row?.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
          return reject(
            tooManyRequests('Account temporarily locked. Try again later.')
          )
        }

        return resolve(undefined)
      })
    )
  }

  function resetFailedLoginState(
    resetByEmail: (normalizedEmail: string) => Promise,
    email: string
  ): FutureInstance {
    return attemptQuery(async () => {
      await resetByEmail(email.toLowerCase())
    })
  }

  function ensureNotLocked(email: string): FutureInstance {
    return ensureEmailNotLocked(
      normalizedEmail =>
        database
          .selectFrom('users')
          .select(['lockedUntil'])
          .where('email', '=', normalizedEmail)
          .where('active', '=', true)
          .executeTakeFirst(),
      email
    )
  }

  function recordFailedLogin(email: string): FutureInstance {
    return attemptQuery(async () => {
      const row = await database
        .selectFrom('users')
        .select(['id', 'failedLoginCount'])
        .where('email', '=', email.toLowerCase())
        .where('active', '=', true)
        .executeTakeFirst()

      if (!row) {
        return
      }

      const newCount = row.failedLoginCount + 1

      if (newCount >= MAX_FAILED_ATTEMPTS) {
        await database
          .updateTable('users')
          .set({
            failedLoginCount: newCount,
            lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
          })
          .where('id', '=', row.id)
          .execute()
      } else {
        await database
          .updateTable('users')
          .set({ failedLoginCount: newCount })
          .where('id', '=', row.id)
          .execute()
      }
    })
  }

  function resetFailedLoginCount(email: string): FutureInstance {
    return resetFailedLoginState(
      normalizedEmail =>
        database
          .updateTable('users')
          .set({ failedLoginCount: 0, lockedUntil: null })
          .where('email', '=', normalizedEmail)
          .where('active', '=', true)
          .execute(),
      email
    )
  }

  // Staff lockout

  function ensureStaffNotLocked(email: string): FutureInstance {
    return ensureEmailNotLocked(
      normalizedEmail =>
        database
          .selectFrom('staff_users')
          .select(['lockedUntil'])
          .where('email', '=', normalizedEmail)
          .where('active', '=', true)
          .executeTakeFirst(),
      email
    )
  }

  function recordStaffFailedLogin(email: string): FutureInstance {
    return attemptQuery(async () => {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS)

      await database
        .updateTable('staff_users')
        .set({
          failedLoginCount: sql`"failedLoginCount" + 1`,
          lockedUntil: sql`
            case
              when "failedLoginCount" >= ${
                MAX_FAILED_ATTEMPTS - 1
              } then ${lockedUntil}
              else "lockedUntil"
            end
          `,
        })
        .where('email', '=', email.toLowerCase())
        .where('active', '=', true)
        .execute()
    })
  }

  function resetStaffFailedLoginCount(email: string): FutureInstance {
    return resetFailedLoginState(
      normalizedEmail =>
        database
          .updateTable('staff_users')
          .set({ failedLoginCount: 0, lockedUntil: null })
          .where('email', '=', normalizedEmail)
          .where('active', '=', true)
          .execute(),
      email
    )
  }

  function createSession(
    subjectId: string,
    subjectType: 'user' | 'staff'
  ): FutureInstance {
    const decodedSubjectId = decodeId(subjectId)

    if (decodedSubjectId == null) {
      return reject(badRequest('Cannot decode session.subjectId'))
    }

    const rawToken = createToken()
    const tokenHash = hashToken(rawToken)

    return attemptQuery(() => {
      return database
        .insertInto('sessions')
        .values({
          sessionTokenHash: tokenHash,
          subjectId: decodedSubjectId,
          subjectType,
        })
        .returning([
          'id',
          'sessionTokenHash',
          'subjectId',
          'subjectType',
          'createdAt',
        ])
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(
      map(values => ({
        ...withEncodedId(values),
        // Return the raw token to the caller, not the stored hash
        sessionToken: rawToken,
        subjectId: encodeId(values.subjectId),
        createdAt: values.createdAt.toISOString(),
      }))
    )
  }

  function getSessionByToken(sessionToken: string): FutureInstance {
    const tokenHash = hashToken(sessionToken)
    // Reject sessions older than the hard expiry window
    const cutoff = addMinutes(new Date(), -sessionHardExpirySeconds / 60)

    return attemptQuery(async () => {
      return database
        .selectFrom('sessions')
        .select([
          'id',
          'sessionTokenHash',
          'subjectId',
          'subjectType',
          'createdAt',
        ])
        .where('sessionTokenHash', '=', tokenHash)
        .where('createdAt', '>', cutoff)
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(
      map(values => ({
        ...withEncodedId(values),
        // Return the raw token to the caller, not the stored hash
        sessionToken,
        subjectId: encodeId(values.subjectId),
        createdAt: values.createdAt.toISOString(),
      }))
    )
  }

  function destroySession(sessionToken: string): FutureInstance {
    return getSessionByToken(sessionToken).pipe(
      chain(() =>
        attemptQuery(async () => {
          await database
            .deleteFrom('sessions')
            .where('sessionTokenHash', '=', hashToken(sessionToken))
            .execute()
        })
      )
    )
  }

  function deleteExpiredSessions(): FutureInstance {
    const cutoff = addMinutes(new Date(), -sessionHardExpirySeconds / 60)
    return attemptQuery(() =>
      database
        .deleteFrom('sessions')
        .where('createdAt', '<=', cutoff)
        .executeTakeFirst()
    ).pipe(map(result => result?.numDeletedRows ?? 0n))
  }

  // Password reset tokens expire after 1 hour
  const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000

  function createPasswordResetToken(userId: string): FutureInstance {
    const decodedUserId = decodeId(userId)

    if (decodedUserId == null) {
      return reject(badRequest('Invalid user ID'))
    }

    const rawToken = createToken()

    return attemptQuery(() => {
      return database
        .insertInto('password_reset_tokens')
        .values({
          token: rawToken,
          userId: decodedUserId,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
        })
        .executeTakeFirstOrThrow()
    }).pipe(map(() => rawToken))
  }

  function validatePasswordResetToken(token: string): FutureInstance {
    return attemptQuery(() =>
      database
        .selectFrom('password_reset_tokens')
        .select(['id', 'userId', 'expiresAt', 'usedAt'])
        .where('token', '=', token)
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(
      chain(row => {
        // Token is already used — treat as not found to prevent guessing
        if (row.usedAt != null) {
          return reject(notFound())
        }

        // Token has expired
        if (row.expiresAt.getTime() < Date.now()) {
          return reject(notFound())
        }

        return resolve({
          id: encodeId(row.id),
          userId: encodeId(row.userId),
        })
      })
    )
  }

  function applyPasswordReset(
    token: string,
    newPassword: string
  ): FutureInstance {
    return validatePasswordResetToken(token).pipe(
      chain(({ userId }) => {
        const decodedUserId = decodeId(userId)

        if (decodedUserId == null) {
          return reject(badRequest('Invalid user ID'))
        }

        return attemptQuery(async () => {
          const newHash = await argon2.hash(newPassword)

          await database
            .updateTable('users')
            .set({ password: newHash })
            .where('id', '=', decodedUserId)
            .execute()
        })
          .pipe(
            chain(() =>
              // Invalidate all existing sessions for this user
              attemptQuery(async () => {
                await database
                  .deleteFrom('sessions')
                  .where('subjectId', '=', decodedUserId)
                  .where('subjectType', '=', 'user')
                  .execute()
              })
            )
          )
          .pipe(
            chain(() =>
              // Mark token as used so it cannot be reused
              attemptQuery(async () => {
                await database
                  .updateTable('password_reset_tokens')
                  .set({ usedAt: new Date() })
                  .where('token', '=', token)
                  .execute()
              })
            )
          )
      })
    )
  }

  return {
    // Access control
    ensureStaffUser,
    ensureStaffUserIsAdmin,
    ensureCanModifyStaffUser,
    ensureUser,
    ensureUserIsAdmin,
    ensureUserMatchesEmail,
    ensureCanAccessAccount,
    ensureCanModifyAccount,
    ensureCanAccessUser,
    ensureCanModifyUser,

    // Staff users
    createStaffUser,
    deactivateStaffUser,
    updateStaffUserName,
    getStaffUserByEmailAndPassword,
    getStaffUserById,
    getStaffUserByEmail,
    getStaffUserIsAdmin,

    // Accounts
    createAccount,
    updateAccountName,
    getAccountById,
    getAccountForUser,
    getAccountForInvitation,
    listAccounts,
    getStaffAccountById,
    listProjectsForAccount,
    listUsersForAccount,

    // Invitations
    createInvitation,
    deactivateInvitation,
    getInvitationById,
    getInvitationByTokenAndEmail,

    // Users
    createUser,
    setUserIsAdmin,
    deactivateUser,
    updateUserName,
    getUserByEmail,
    getUserByEmailAndPassword,
    getUserById,
    getUserByIdForStaff,
    getUserEmailById,
    getUserIsAdmin,
    sendVerificationEmail,
    verifyUser,

    // Lockout
    ensureNotLocked,
    recordFailedLogin,
    resetFailedLoginCount,

    // Staff lockout
    ensureStaffNotLocked,
    recordStaffFailedLogin,
    resetStaffFailedLoginCount,

    // Sessions
    createSession,
    getSessionByToken,
    destroySession,
    deleteExpiredSessions,

    // Password reset
    createPasswordResetToken,
    validatePasswordResetToken,
    applyPasswordReset,
  }
}

export type AccountService = ReturnType
