import { tapF } from '@repro/future-utils'
import { FastifyPluginAsync } from 'fastify'
import { chain, chainRej, go, reject } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import { isNotFound, notAuthenticated } from '~/utils/errors'
import { createResponseUtils } from '~/utils/response'

const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
} as const

export function createStaffRouter(
  accountService: AccountService,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    const app = fastify.withTypeProvider()

    app.post<{
      Body: z.infer<typeof loginSchema.body>
    }>(
      '/login',
      {
        schema: loginSchema,
        config: {
          rateLimit: {
            max: 10,
            timeWindow: '15 minutes',
          },
        },
      },
      (req, res) => {
        respondWith(
          res,
          accountService
            .ensureStaffNotLocked(req.body.email)
            .pipe(
              chain(() =>
                accountService.getStaffUserByEmailAndPassword(
                  req.body.email,
                  req.body.password
                )
              )
            )
            .pipe(
              chainRej(error => {
                if (isNotFound(error)) {
                  return accountService
                    .recordStaffFailedLogin(req.body.email)
                    .pipe(chain(() => reject(notAuthenticated())))
                }
                return reject(error)
              })
            )
            .pipe(tapF(user => req.createSession(user)))
            .pipe(
              tapF(() =>
                accountService.resetStaffFailedLoginCount(req.body.email)
              )
            )
        )
      }
    )

    app.post('/logout', (req, res) => {
      respondWith(res, req.revokeSession())
    })

    app.get('/me', (req, res) => {
      respondWith(res, req.getCurrentUser())
    })

    const paginationSchema = {
      querystring: z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(250).default(50),
      }),
    } as const

    // List all accounts
    app.get<{
      Querystring: z.infer<typeof paginationSchema.querystring>
    }>('/accounts', { schema: paginationSchema }, (req, res) => {
      const { cursor, limit } = req.query
      respondWith(
        res,
        go(function* () {
          const user = yield req.getCurrentUser()
          yield accountService.ensureStaffUser(user)
          return yield accountService.listAccounts({ cursor, limit })
        })
      )
    })

    const accountIdSchema = {
      params: z.object({
        accountId: z.string(),
      }),
    } as const

    // Get account by ID
    app.get<{
      Params: z.infer<typeof accountIdSchema.params>
    }>(
      '/accounts/:accountId',
      {
        schema: accountIdSchema,
      },
      (req, res) => {
        const { accountId } = req.params
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureStaffUser(user)
            return yield accountService.getAccountById(accountId)
          })
        )
      }
    )

    const accountUsersPaginationSchema = {
      params: z.object({
        accountId: z.string(),
      }),
      querystring: z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(250).default(50),
      }),
    } as const

    // List users in account
    app.get<{
      Params: z.infer<typeof accountUsersPaginationSchema.params>
      Querystring: z.infer<typeof accountUsersPaginationSchema.querystring>
    }>(
      '/accounts/:accountId/users',
      { schema: accountUsersPaginationSchema },
      (req, res) => {
        const { accountId } = req.params
        const { cursor, limit } = req.query
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureStaffUser(user)
            return yield accountService.listUsersForAccount(accountId, {
              cursor,
              limit,
            })
          })
        )
      }
    )

    const userIdSchema = {
      params: z.object({
        userId: z.string(),
      }),
    } as const

    // Get user by ID
    app.get<{
      Params: z.infer<typeof userIdSchema.params>
    }>(
      '/users/:userId',
      {
        schema: userIdSchema,
      },
      (req, res) => {
        const { userId } = req.params
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureStaffUser(user)
            return yield accountService.getUserByIdForStaff(userId)
          })
        )
      }
    )

    const updateUserSchema = {
      params: z.object({
        userId: z.string(),
      }),
      body: z.object({
        isAdmin: z.boolean().optional(),
        // Only deactivation is supported; reactivation is not exposed via this API
        isActive: z.literal(false).optional(),
      }),
    } as const

    // Update user (toggle admin, deactivate)
    app.patch<{
      Params: z.infer<typeof updateUserSchema.params>
      Body: z.infer<typeof updateUserSchema.body>
    }>(
      '/users/:userId',
      {
        schema: updateUserSchema,
      },
      (req, res) => {
        const { userId } = req.params
        const { isAdmin, isActive } = req.body
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUser()
            yield accountService.ensureStaffUser(user)

            // Fetch the snapshot first so we can return it consistently,
            // even after deactivation renders the user unfetchable
            const targetUser = yield accountService.getUserByIdForStaff(userId)

            if (isAdmin !== undefined) {
              yield accountService.setUserIsAdmin(userId, isAdmin)
            }

            if (isActive === false) {
              yield accountService.deactivateUser(userId)
            }

            return targetUser
          })
        )
      }
    )
  }
}
