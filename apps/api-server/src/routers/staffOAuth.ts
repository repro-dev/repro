import { StaffUser } from '@repro/domain'
import { generateCodeVerifier, generateState } from 'arctic'
import { FastifyPluginAsync } from 'fastify'
import { bichain, encaseP, go, mapRej, reject, resolve } from 'fluture'
import { Env } from '~/config/createEnv'
import { defaultSystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import { isNotFound } from '~/utils/errors'
import { createResponseUtils } from '~/utils/response'
import { OAuthProvider, OAuthProviders } from './socialAuth'

export type { OAuthProvider, OAuthProviders }

// Short-lived: only needs to survive the OAuth redirect round-trip
const OAUTH_COOKIE_MAX_AGE = 300

// Staff OAuth only allows @repro.dev email addresses
const ALLOWED_DOMAIN = 'repro.dev'

type ProviderParams = { provider: string }
type CallbackQuery = { code?: string; state?: string }

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function createStaffOAuthRouter(
  accountService: AccountService,
  env: Env,
  providers: OAuthProviders,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    // GET /oauth/:provider — initiate the OAuth flow
    fastify.get('/oauth/:provider', async (req, res) => {
      const { provider } = req.params as ProviderParams
      const oauthProvider = providers[provider]

      if (oauthProvider == null) {
        await res
          .status(400)
          .send({ message: `Unsupported provider: ${provider}` })
        return
      }

      const state = generateState()
      const codeVerifier = generateCodeVerifier()
      const url = oauthProvider.createAuthorizationURL(state, codeVerifier)

      res.setCookie('oauth_state', state, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: 'auto',
        maxAge: OAUTH_COOKIE_MAX_AGE,
      })

      res.setCookie('oauth_code_verifier', codeVerifier, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: 'auto',
        maxAge: OAUTH_COOKIE_MAX_AGE,
      })

      await res.redirect(url.toString())
    })

    // GET /oauth/:provider/callback — handle the OAuth callback
    fastify.get('/oauth/:provider/callback', (req, res): void => {
      const { provider } = req.params as ProviderParams
      const { code, state } = req.query as CallbackQuery
      const oauthProvider = providers[provider]

      if (oauthProvider == null) {
        res.status(400).send({ message: `Unsupported provider: ${provider}` })
        return
      }

      const storedState = req.cookies['oauth_state']
      const storedVerifier = req.cookies['oauth_code_verifier']

      if (storedState == null || storedVerifier == null) {
        res.status(400).send({ message: 'Missing OAuth state cookie' })
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

      const handleCallback = go(function* () {
        const tokens = yield encaseP((verifier: string) =>
          oauthProvider.validateAuthorizationCode(code, verifier)
        )(storedVerifier).pipe(mapRej(asError))

        const accessToken = tokens.accessToken()

        const userInfo = yield encaseP((token: string) =>
          oauthProvider.fetchUserInfo(token)
        )(accessToken).pipe(mapRej(asError))

        const { email, name } = userInfo
        const emailDomain = email.split('@')[1]

        if (emailDomain !== ALLOWED_DOMAIN) {
          res.redirect(`${env.REPRO_ADMIN_URL}/login?error=domain_not_allowed`)
          return undefined
        }

        const lookupOrCreate = accountService
          .getStaffUserByEmail(email)
          .pipe(
            bichain(error => {
              const normalizedError = asError(error)

              return isNotFound(normalizedError)
                ? accountService.createStaffUser(name || email, email, '')
                : reject(normalizedError)
            })(staffUser => resolve(staffUser))
          )
          .pipe(mapRej(asError))

        const staffUser: StaffUser = yield lookupOrCreate

        yield req.createSession(staffUser).pipe(mapRej(asError))
        res.redirect(env.REPRO_ADMIN_URL)

        return undefined
      }).pipe(mapRej(asError))

      respondWith(res, handleCallback)
    })
  }
}
