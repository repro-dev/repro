import { PmConnection, PmProvider } from '@repro/domain'
import { generateState } from 'arctic'
import { FastifyPluginAsync } from 'fastify'
import { FutureInstance, chain, encaseP, go, map, reject } from 'fluture'
import { Env } from '~/config/createEnv'
import { defaultSystemConfig } from '~/config/system'
import { decodeId, encodeId } from '~/modules/database'
import { AccountService } from '~/services/account'
import { PmIntegrationService } from '~/services/pmIntegrations'
import { badRequest, notFound } from '~/utils/errors'
import { getCurrentUserAccount } from '~/utils/request'
import { createResponseUtils } from '~/utils/response'

// Five-minute max-age for the PM OAuth state cookie.
const PM_OAUTH_COOKIE_MAX_AGE = 300

export interface PmOAuthProvider {
  createAuthorizationURL(state: string, scopes: string[]): URL
  validateAuthorizationCode(code: string): Promise<{
    accessToken(): string
    hasRefreshToken(): boolean
    refreshToken(): string
    accessTokenExpiresAt(): Date
    scopes(): string[]
  }>
  fetchWorkspaceInfo(accessToken: string): Promise<{ id: string; name: string }>
}

export type PmOAuthProviders = Record<string, PmOAuthProvider>

function toSafeConnection(row: {
  id: number
  provider: PmProvider
  providerWorkspaceId: string
  scopes: string[]
  status: string
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}): PmConnection {
  return {
    id: encodeId(row.id),
    provider: row.provider,
    providerWorkspaceId: row.providerWorkspaceId,
    scopes: row.scopes,
    status: row.status as PmConnection['status'],
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function createPmIntegrationRouter(
  accountService: AccountService,
  pmIntegrationService: PmIntegrationService,
  env: Env,
  providers: PmOAuthProviders,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    // GET /connections — list account-scoped PM connections, never returning tokens
    fastify.get('/connections', (req, res): void => {
      const userAccount: FutureInstance<
        Error,
        { user: any; account: { id: string } }
      > = getCurrentUserAccount(req, accountService)

      const future = userAccount.pipe(
        chain(({ account }) => {
          const decodedAccountId = decodeId(account.id)

          if (decodedAccountId == null) {
            return reject(badRequest('Invalid account ID'))
          }

          return pmIntegrationService.listConnections(decodedAccountId).pipe(
            map(rows => ({
              items: rows.map(toSafeConnection),
            }))
          )
        })
      )

      respondWith(res, future)
    })

    // GET /oauth/:provider — initiate OAuth flow
    fastify.get<{ Params: { provider: string } }>(
      '/oauth/:provider',
      async (req, res) => {
        const { provider } = req.params
        const oauthProvider = providers[provider]

        if (oauthProvider == null) {
          req.log.warn(
            { provider, configuredProviders: Object.keys(providers) },
            'PM OAuth: requested provider is not configured (missing OAuth credentials?)'
          )
          await res
            .status(400)
            .send({ message: `Unsupported provider: ${provider}` })
          return
        }

        const state = generateState()
        // Linear's only read scope is `read` (it grants read access to
        // issues, comments, projects, etc.). Granular `*:read` scopes do not
        // exist in Linear's OAuth vocabulary. Issue creation (write) is added
        // by the consumer issues (REP-1237) when they need it.
        const url = oauthProvider.createAuthorizationURL(state, ['read'])

        res.setCookie('pm_oauth_state', state, {
          httpOnly: true,
          path: '/',
          sameSite: 'lax',
          secure: 'auto',
          maxAge: PM_OAUTH_COOKIE_MAX_AGE,
        })

        await res.redirect(url.toString())
      }
    )

    // GET /oauth/:provider/callback — handle OAuth callback
    fastify.get<{
      Params: { provider: string }
      Querystring: { code?: string; state?: string }
    }>('/oauth/:provider/callback', (req, res): void => {
      const { provider } = req.params
      const { code, state } = req.query
      const oauthProvider = providers[provider]

      if (oauthProvider == null) {
        req.log.warn(
          { provider, configuredProviders: Object.keys(providers) },
          'PM OAuth: requested provider is not configured (missing OAuth credentials?)'
        )
        res.status(400).send({ message: `Unsupported provider: ${provider}` })
        return
      }

      const storedState = req.cookies['pm_oauth_state']

      if (storedState == null) {
        res.status(400).send({ message: 'Missing PM OAuth state cookie' })
        return
      }

      if (state !== storedState) {
        res.status(400).send({ message: 'Invalid OAuth state' })
        return
      }

      if (!code) {
        res.status(400).send({ message: 'Missing authorization code' })
        return
      }

      const codeToExchange = code

      const handleCallback: FutureInstance<Error, PmConnection> = go(
        function* () {
          // Authenticate user and resolve their account
          const { account } = yield getCurrentUserAccount(req, accountService)
          const decodedAccountId = decodeId(account.id)

          if (decodedAccountId == null) {
            yield reject(badRequest('Invalid account ID'))
          }

          // Exchange the authorization code for tokens
          const tokens: {
            accessToken(): string
            hasRefreshToken(): boolean
            refreshToken(): string
            accessTokenExpiresAt(): Date
            scopes(): string[]
          } = yield encaseP((_code: string) =>
            oauthProvider.validateAuthorizationCode(_code)
          )(codeToExchange)

          const accessToken = tokens.accessToken()
          const refreshToken = tokens.hasRefreshToken()
            ? tokens.refreshToken()
            : null
          const expiresAt = tokens.accessTokenExpiresAt()
          const scopes = tokens.scopes()

          // Fetch workspace info to identify the organization
          const workspaceInfo: { id: string; name: string } = yield encaseP(
            (token: string) => oauthProvider.fetchWorkspaceInfo(token)
          )(accessToken)

          // Persist the connection (upsert on conflict)
          const row = yield pmIntegrationService.upsertConnection({
            accountId: decodedAccountId!,
            provider: provider as PmProvider,
            providerWorkspaceId: workspaceInfo.id,
            accessToken,
            refreshToken,
            expiresAt,
            scopes,
            status: 'connected',
          })

          return toSafeConnection(row)
        }
      ) as FutureInstance<Error, PmConnection>

      respondWith(
        res,
        handleCallback.pipe(
          map(() => {
            res.redirect(env.REPRO_APP_URL)
          })
        ) as FutureInstance<Error, void>
      )
    })

    // POST /connections/:id/disconnect — disconnect a provider
    fastify.post<{ Params: { id: string } }>(
      '/connections/:id/disconnect',
      (req, res): void => {
        const userAccount: FutureInstance<
          Error,
          { user: any; account: { id: string } }
        > = getCurrentUserAccount(req, accountService)

        const future = userAccount.pipe(
          chain(({ account }) => {
            const decodedAccountId = decodeId(account.id)

            if (decodedAccountId == null) {
              return reject(badRequest('Invalid account ID'))
            }

            // Decode the connection id parameter to find the connection
            const decodedConnectionId = decodeId(req.params.id)

            if (decodedConnectionId == null) {
              return reject(badRequest('Invalid connection ID'))
            }

            // Fetch the connection to determine the provider
            return pmIntegrationService.listConnections(decodedAccountId).pipe(
              chain(rows => {
                const connection = rows.find(r => r.id === decodedConnectionId)

                if (connection == null) {
                  return reject(notFound('Connection not found'))
                }

                return pmIntegrationService
                  .disconnectConnection(decodedAccountId, connection.provider)
                  .pipe(map(() => ({ status: 'disconnected' })))
              })
            )
          })
        )

        respondWith(res, future)
      }
    )
  }
}
