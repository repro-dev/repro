import { tapF } from '@repro/future-utils'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { mapRej } from 'fluture'
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
  }
}
