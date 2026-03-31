import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { chain, map, reject } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { decodeId, withEncodedId } from '~/modules/database'
import { AccountService } from '~/services/account'
import { OAuthService } from '~/services/oauth'
import { badRequest } from '~/utils/errors'
import { createResponseUtils } from '~/utils/response'

const tokenSchema = {
  body: z.object({
    grant_type: z.string(),
    code: z.string(),
    code_verifier: z.string(),
    client_id: z.string(),
    redirect_uri: z.string(),
  }),
} as const

const revokeSchema = {
  body: z.object({
    keyId: z.string(),
  }),
} as const

const registerClientSchema = {
  body: z.object({
    name: z.string(),
    redirectUris: z.array(z.string()),
  }),
} as const

export function createOAuthRouter(
  oauthService: OAuthService,
  _accountService: AccountService,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    app.post<{
      Body: z.infer<typeof tokenSchema.body>
    }>('/token', { schema: tokenSchema }, (req, res) => {
      if (req.body.grant_type !== 'authorization_code') {
        respondWith(res, reject(badRequest('Unsupported grant_type')))
        return
      }

      const future = oauthService
        .exchangeCode(
          req.body.code,
          req.body.code_verifier,
          req.body.client_id,
          req.body.redirect_uri
        )
        .pipe(
          map(key => ({
            access_token: key.token,
            token_type: 'Bearer',
            scope: key.scopes.join(' '),
          }))
        )

      respondWith(res, future)
    })

    app.get('/keys', (req, res) => {
      const future = req
        .getCurrentUser()
        .pipe(
          chain(user => {
            const userId = decodeId(user.id)!
            return oauthService.listApiKeys(userId)
          })
        )
        .pipe(map(keys => ({ items: keys.map(withEncodedId) })))

      respondWith(res, future)
    })

    app.post<{
      Body: z.infer<typeof revokeSchema.body>
    }>('/revoke', { schema: revokeSchema }, (req, res) => {
      const keyId = decodeId(req.body.keyId)

      if (keyId === null) {
        respondWith(res, reject(badRequest('Invalid keyId')))
        return
      }

      const future = req
        .getCurrentUser()
        .pipe(
          chain(user => {
            const userId = decodeId(user.id)!
            return oauthService.revokeApiKey(keyId, userId)
          })
        )
        .pipe(map(() => undefined))

      respondWith(res, future)
    })

    app.post<{
      Body: z.infer<typeof registerClientSchema.body>
    }>('/clients', { schema: registerClientSchema }, (req, res) => {
      const future = req.getCurrentUser().pipe(
        chain(user => {
          const userId = decodeId(user.id)!
          return oauthService.registerClient(
            userId,
            req.body.name,
            req.body.redirectUris
          )
        })
      )

      respondWith(res, future, 201)
    })
  }
}
