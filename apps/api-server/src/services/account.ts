import * as argon2 from '@node-rs/argon2'
import { Account, Invitation, Session, StaffUser, User } from '@repro/domain'
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
import { createHash, randomBytes } from 'node:crypto'
import { SystemConfig, defaultSystemConfig } from '~/config/system'
import {
  Database,
  asStaffUser,
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
  _config: SystemConfig = defaultSystemConfig
) {
  function ensureStaffUser(
    user: User | StaffUser | null
  ): FutureInstance<Error, StaffUser> {
    return user != null && user.type === 'staff'
      ? getStaffUserById(user.id)
      : reject(permissionDenied())
  }

  function ensureStaffUserIsAdmin(
    user: User | StaffUser | null
  ): FutureInstance<Error, StaffUser> {
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

  function ensureUser(
    user: User | StaffUser | null
  ): FutureInstance<Error, User> {
    return user != null && user.type === 'user'
      ? getUserById(user.id)
      : reject(permissionDenied())
  }

  function ensureUserIsAdmin(
    user: User | StaffUser | null
  ): FutureInstance<Error, User> {
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
  ): FutureInstance<Error, User> {
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
  ): FutureInstance<Error, StaffUser> {
    return ensureStaffUserIsAdmin(actor)
  }

  function ensureCanAccessAccount(
    actor: User | StaffUser | null,
    subjectAccountId: string
  ): FutureInstance<Error, User | StaffUser> {
    if (actor == null) {
      return reject(permissionDenied())
    }

    return alt<Error, User | StaffUser>(
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
  ): FutureInstance<Error, User | StaffUser> {
    return alt(
      and(ensureCanAccessAccount(actor, subjectAccountId))(
        ensureUserIsAdmin(actor)
      )
    )(ensureStaffUser(actor))
  }

  function ensureCanAccessUser(
    actor: User | StaffUser | null,
    subjectUserId: string
  ): FutureInstance<Error, User | StaffUser> {
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

    return alt<Error, User | StaffUser>(ensureSameAccount)(
      ensureStaffUser(actor)
    )
  }

  function ensureCanModifyUser(
    actor: User | StaffUser | null,
    subjectUserId: string
  ): FutureInstance<Error, User | StaffUser> {
    if (actor == null) {
      return reject(permissionDenied())
    }

    return alt<Error, User | StaffUser>(
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
  ): FutureInstance<Error, StaffUser> {
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
            .returning(['id', 'name', 'email'])
            .executeTakeFirstOrThrow()
        }).pipe(map(asStaffUser))
      )
    )
  }

  function getStaffUserIsAdmin(
    staffUserId: string
  ): FutureInstance<Error, boolean> {
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
  ): FutureInstance<Error, StaffUser> {
    return attemptQuery(async () => {
      const row = await database
        .selectFrom('staff_users')
        .select(['id', 'name', 'email', 'password'])
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

  function getStaffUserById(
    staffUserId: string
  ): FutureInstance<Error, StaffUser> {
    return attemptQuery(() =>
      database
        .selectFrom('staff_users')
        .select(['id', 'name', 'email'])
        .where('id', '=', decodeId(staffUserId))
        .where('active', '=', true)
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(asStaffUser))
  }

  function updateStaffUserName(
    staffUserId: string,
    name: string
  ): FutureInstance<Error, void> {
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

  function deactivateStaffUser(
    staffUserId: string
  ): FutureInstance<Error, void> {
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

  function createAccount(name: string): FutureInstance<Error, Account> {
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

  function getAccountById(accountId: string): FutureInstance<Error, Account> {
    return attemptQuery(() => {
      return database
        .selectFrom('accounts')
        .select(['id', 'name'])
        .where('id', '=', decodeId(accountId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(withEncodedId))
  }

  function getAccountForUser(userId: string): FutureInstance<Error, Account> {
    return attemptQuery(() => {
      return database
        .selectFrom('users as u')
        .innerJoin('accounts as a', 'a.id', 'u.accountId')
        .select(['a.id', 'a.name'])
        .where('u.id', '=', decodeId(userId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(withEncodedId))
  }

  function getAccountForInvitation(
    invitationId: string
  ): FutureInstance<Error, Account> {
    return attemptQuery(() => {
      return database
        .selectFrom('invitations as i')
        .innerJoin('accounts as a', 'a.id', 'i.accountId')
        .select(['a.id', 'a.name'])
        .where('i.id', '=', decodeId(invitationId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(withEncodedId))
  }

  function listAccounts(
    order: 'asc' | 'desc' = 'asc'
  ): FutureInstance<Error, Array<Account>> {
    return attemptQuery(() => {
      return database
        .selectFrom('accounts')
        .select(['id', 'name'])
        .orderBy(`createdAt ${order}`)
        .execute()
    }).pipe(map(rows => rows.map(withEncodedId)))
  }

  function updateAccountName(
    accountId: string,
    name: string
  ): FutureInstance<Error, void> {
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

  function createInvitation(
    accountId: string,
    email: string
  ): FutureInstance<Error, Invitation> {
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

  function getInvitationById(
    invitationId: string
  ): FutureInstance<Error, Invitation> {
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
  ): FutureInstance<Error, Invitation> {
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

  function deactivateInvitation(
    invitationId: string
  ): FutureInstance<Error, void> {
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
  ): FutureInstance<Error, User> {
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

  function getUserIsAdmin(userId: string): FutureInstance<Error, boolean> {
    return attemptQuery(() => {
      return database
        .selectFrom('users')
        .select('admin')
        .where('id', '=', decodeId(userId))
        .executeTakeFirstOrThrow()
    }).pipe(map(row => row.admin))
  }

  function setUserIsAdmin(
    userId: string,
    admin: boolean
  ): FutureInstance<Error, void> {
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

  function updateUserName(
    userId: string,
    name: string
  ): FutureInstance<Error, void> {
    return attemptQuery(async () => {
      await database
        .updateTable('users')
        .set('name', name)
        .where('id', '=', decodeId(userId))
        .execute()
    })
  }

  function getUserById(id: string): FutureInstance<Error, User> {
    return attemptQuery(() =>
      database
        .selectFrom('users')
        .select(['id', 'name', 'email', 'verified'])
        .where('id', '=', decodeId(id))
        .where('active', '=', true)
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(asUser))
  }

  function getUserEmailById(id: string): FutureInstance<Error, string> {
    return attemptQuery(() =>
      database
        .selectFrom('users')
        .select(['email'])
        .where('id', '=', decodeId(id))
        .where('active', '=', true)
        .executeTakeFirstOrThrow(() => notFound())
    ).pipe(map(row => row.email))
  }

  function getUserByEmail(email: string): FutureInstance<Error, User> {
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
  ): FutureInstance<Error, User> {
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

  function deactivateUser(userId: string): FutureInstance<Error, void> {
    return attemptQuery(async () => {
      await database
        .updateTable('users')
        .set('active', false)
        .where('id', '=', decodeId(userId))
        .execute()
    })
  }

  function sendVerificationEmail(userId: string): FutureInstance<Error, void> {
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
  ): FutureInstance<Error, void> {
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

  function ensureNotLocked(email: string): FutureInstance<Error, void> {
    return attemptQuery(() =>
      database
        .selectFrom('users')
        .select(['lockedUntil'])
        .where('email', '=', email.toLowerCase())
        .where('active', '=', true)
        .executeTakeFirst()
    ).pipe(
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

  function recordFailedLogin(email: string): FutureInstance<Error, void> {
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

  function resetFailedLoginCount(email: string): FutureInstance<Error, void> {
    return attemptQuery(async () => {
      await database
        .updateTable('users')
        .set({ failedLoginCount: 0, lockedUntil: null })
        .where('email', '=', email.toLowerCase())
        .where('active', '=', true)
        .execute()
    })
  }

  function createSession(
    subjectId: string,
    subjectType: 'user' | 'staff'
  ): FutureInstance<Error, Session> {
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

  function getSessionByToken(
    sessionToken: string
  ): FutureInstance<Error, Session> {
    const tokenHash = hashToken(sessionToken)

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

  function destroySession(sessionToken: string): FutureInstance<Error, void> {
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
    getStaffUserIsAdmin,

    // Accounts
    createAccount,
    updateAccountName,
    getAccountById,
    getAccountForUser,
    getAccountForInvitation,
    listAccounts,

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
    getUserEmailById,
    getUserIsAdmin,
    sendVerificationEmail,
    verifyUser,

    // Lockout
    ensureNotLocked,
    recordFailedLogin,
    resetFailedLoginCount,

    // Sessions
    createSession,
    getSessionByToken,
    destroySession,
  }
}

export type AccountService = ReturnType<typeof createAccountService>
