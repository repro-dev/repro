import { StaffUser } from '@repro/domain'
import { generateCodeVerifier, generateState } from 'arctic'
import { FastifyPluginAsync } from 'fastify'
import { FutureInstance, bichain, encaseP, go, reject, resolve } from 'fluture'
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

export function createStaffOAuthRouter(
  accountService: AccountService,
  env: Env,
  providers: OAuthProviders,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    // GET /oauth/:provider — initiate the OAuth flow
    fastify.get<{ Params: { provider: string } }>(
      '/oauth/:provider',
      async (req, res) => {
        const { provider } = req.params
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
      }
    )

    // GET /oauth/:provider/callback — handle the OAuth callback
    fastify.get<{
      Params: { provider: string }
      Querystring: { code?: string; state?: string }
    }>('/oauth/:provider/callback', (req, res): void => {
      const { provider } = req.params
      const { code, state } = req.query
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

      const codeToExchange = code

      const handleCallback: FutureInstance<Error, void> = go(function* () {
        // Exchange the code for tokens
        const tokens: {
          accessToken(): string
          hasRefreshToken(): boolean
          refreshToken(): string
          accessTokenExpiresAt(): Date
        } = yield encaseP((verifier: string) =>
          oauthProvider.validateAuthorizationCode(codeToExchange, verifier)
        )(storedVerifier)

        const accessToken = tokens.accessToken()

        // Fetch the Google user profile
        const userInfo: { sub: string; email: string; name: string } =
          yield encaseP((token: string) => oauthProvider.fetchUserInfo(token))(
            accessToken
          )

        const { email, name } = userInfo

        // Enforce @repro.dev domain restriction
        const emailDomain = email.split('@')[1]
        if (emailDomain !== ALLOWED_DOMAIN) {
          // Redirect to login with an error — do not create a session
          res.redirect(`${env.REPRO_ADMIN_URL}/login?error=domain_not_allowed`)
          return yield resolve(undefined as void)
        }

        // Cast needed: account service uses bare FutureInstance (pre-existing tech debt)
        const lookupOrCreate = (
          accountService.getStaffUserByEmail(
            email
          ) as unknown as FutureInstance<Error, StaffUser>
        ).pipe(
          bichain<Error, Error, StaffUser>(error =>
            isNotFound(error)
              ? // First login — provision a new staff user
                // OAuth users get no password; they can only log in via OAuth
                (accountService.createStaffUser(
                  name || email,
                  email,
                  ''
                ) as unknown as FutureInstance<Error, StaffUser>)
              : reject(error)
          )(s => resolve(s))
        )
        const staffUser = (yield lookupOrCreate) as StaffUser

        // Create a staff session and set the session cookie
        yield req.createSession(staffUser)

        // Redirect to the admin app dashboard
        res.redirect(env.REPRO_ADMIN_URL)
        return yield resolve(undefined as void)
      }) as FutureInstance<Error, void>

      respondWith(res, handleCallback)
    })
  }
}
