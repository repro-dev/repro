import { tapF } from '@repro/future-utils'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go, map, mapRej } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import { isNotFound, notAuthenticated } from '~/utils/errors'
import { toListResponse } from '~/utils/listResponse'
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
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    app.post<{
      Body: z.infer<typeof loginSchema.body>
    }>(
      '/login',
      {
        schema: loginSchema,
      },
      (req, res) => {
        respondWith(
          res,
          accountService
            .getStaffUserByEmailAndPassword(req.body.email, req.body.password)
            .pipe(
              mapRej(error => (isNotFound(error) ? notAuthenticated() : error))
            )
            .pipe(tapF(user => req.createSession(user)))
        )
      }
    )

    app.post('/logout', (req, res) => {
      respondWith(res, req.revokeSession())
    })

    app.get('/me', (req, res) => {
      respondWith(res, req.getCurrentUser())
    })

    // List all accounts
    app.get('/accounts', (req, res) => {
      respondWith(
        res,
        go(function* () {
          const user = yield req.getCurrentUser()
          yield accountService.ensureStaffUser(user)
          return yield accountService.listAccounts()
        }).pipe(map(toListResponse))
      )
    })

    const accountIdSchema = {
      params: z.object({
        accountId: z.string(),
      }),
    } as const

    // Get account by ID
    app.get(
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

    // List users in account
    app.get(
      '/accounts/:accountId/users',
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
            return yield accountService.listUsersForAccount(accountId)
          }).pipe(map(toListResponse))
        )
      }
    )

    const userIdSchema = {
      params: z.object({
        userId: z.string(),
      }),
    } as const

    // Get user by ID
    app.get(
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
        isActive: z.boolean().optional(),
      }),
    } as const

    // Update user (toggle admin, deactivate)
    app.patch(
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

            if (isAdmin !== undefined) {
              yield accountService.setUserIsAdmin(userId, isAdmin)
            }

            if (isActive === false) {
              yield accountService.deactivateUser(userId)
              // User is now inactive; return a success indicator instead of
              // fetching the user (which would fail since active = false)
              return { deactivated: true }
            }

            return yield accountService.getUserByIdForStaff(userId)
          })
        )
      }
    )
  }
}
