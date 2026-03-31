import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { chain, go, reject, resolve } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { decodeId } from '~/modules/database'
import { AccountService } from '~/services/account'
import { ApiKeyService } from '~/services/apiKeys'
import { notAuthenticated } from '~/utils/errors'
import { toListResponse } from '~/utils/listResponse'
import { createResponseUtils } from '~/utils/response'

const createApiKeySchema = {
  body: z.object({
    name: z.string().min(1).max(255),
    scopes: z.array(z.string()).default([]),
    expiresAt: z.string().datetime().optional(),
  }),
} as const

const revokeApiKeySchema = {
  params: z.object({
    id: z.string(),
  }),
} as const

export function createApiKeysRouter(
  apiKeyService: ApiKeyService,
  accountService: AccountService,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    app.post<{
      Body: z.infer<typeof createApiKeySchema.body>
    }>('/api-keys', { schema: createApiKeySchema }, (req, res) => {
      if (!req.session) {
        respondWith(res, reject(notAuthenticated()))
        return
      }

      const { name, scopes, expiresAt } = req.body

      respondWith(
        res,
        go(function* () {
          const currentUser = yield req.getCurrentUser()
          yield accountService.ensureUser(currentUser)
          const account = yield accountService.getAccountForUser(currentUser.id)

          const userId = decodeId(currentUser.id)
          const accountId = decodeId(account.id)

          if (userId == null || accountId == null) {
            return yield reject(
              new Error('Could not resolve user or account ID')
            )
          }

          const result = yield apiKeyService.createApiKey({
            userId,
            accountId,
            name,
            scopes,
            ...(expiresAt != null ? { expiresAt: new Date(expiresAt) } : {}),
          })

          return {
            id: result.id,
            key: result.key,
            prefix: result.prefix,
            name,
            scopes,
            createdAt: new Date().toISOString(),
          }
        }),
        201
      )
    })

    app.get('/api-keys', (req, res) => {
      if (!req.session) {
        respondWith(res, reject(notAuthenticated()))
        return
      }

      respondWith(
        res,
        req.getCurrentUser().pipe(
          chain(currentUser =>
            accountService.ensureUser(currentUser).pipe(
              chain(() => {
                const userId = decodeId(currentUser.id)

                if (userId == null) {
                  return reject(new Error('Could not resolve user ID'))
                }

                return apiKeyService
                  .listApiKeys(userId)
                  .pipe(chain(keys => resolve(toListResponse(keys))))
              })
            )
          )
        )
      )
    })

    app.delete<{
      Params: z.infer<typeof revokeApiKeySchema.params>
    }>('/api-keys/:id', { schema: revokeApiKeySchema }, (req, res) => {
      if (!req.session) {
        respondWith(res, reject(notAuthenticated()))
        return
      }

      respondWith(
        res,
        req.getCurrentUser().pipe(
          chain(currentUser =>
            accountService.ensureUser(currentUser).pipe(
              chain(() => {
                const userId = decodeId(currentUser.id)

                if (userId == null) {
                  return reject(new Error('Could not resolve user ID'))
                }

                return apiKeyService.revokeApiKey({
                  keyId: req.params.id,
                  userId,
                })
              })
            )
          )
        )
      )
    })
  }
}
