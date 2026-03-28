import { User } from '@repro/domain'
import { generateCodeVerifier, generateState } from 'arctic'
import { FastifyPluginAsync } from 'fastify'
import {
  FutureInstance,
  bichain,
  encaseP,
  go,
  map,
  reject,
  resolve,
} from 'fluture'
import { Env } from '~/config/createEnv'
import { defaultSystemConfig } from '~/config/system'
import { decodeId } from '~/modules/database'
import { OAuthProvider as OAuthProviderEnum } from '~/modules/database/schema/OAuthConnectionTable'
import { AccountService } from '~/services/account'
import { OAuthConnection, SocialAuthService } from '~/services/socialAuth'
import { badRequest, isNotFound } from '~/utils/errors'
import { createResponseUtils } from '~/utils/response'

// Five-minute max-age for the OAuth state and code_verifier cookies.
// These are only needed during the redirect round-trip, not the full session.
const OAUTH_COOKIE_MAX_AGE = 300

export interface OAuthProvider {
  createAuthorizationURL(state: string, codeVerifier: string): URL
  validateAuthorizationCode(
    code: string,
    codeVerifier: string
  ): Promise<{
    accessToken(): string
    hasRefreshToken(): boolean
    refreshToken(): string
    accessTokenExpiresAt(): Date
  }>
  fetchUserInfo(accessToken: string): Promise<{
    sub: string
    email: string
    name: string
  }>
}

export type OAuthProviders = Record<string, OAuthProvider>

export function createSocialAuthRouter(
  accountService: AccountService,
  socialAuthService: SocialAuthService,
  env: Env,
  providers: OAuthProviders,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
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

      const handleCallback: FutureInstance<Error, User> = go(function* () {
        // Exchange the authorization code for tokens using encaseP to lift
        // the Promise into a Future (encaseP takes a 1-arg fn; we curry manually)
        const tokens: {
          accessToken(): string
          hasRefreshToken(): boolean
          refreshToken(): string
          accessTokenExpiresAt(): Date
        } = yield encaseP((verifier: string) =>
          oauthProvider.validateAuthorizationCode(codeToExchange, verifier)
        )(storedVerifier)

        const accessToken = tokens.accessToken()
        const refreshToken = tokens.hasRefreshToken()
          ? tokens.refreshToken()
          : null
        const expiresAt = tokens.accessTokenExpiresAt()

        // Fetch Google user profile
        const userInfo: { sub: string; email: string; name: string } =
          yield encaseP((token: string) => oauthProvider.fetchUserInfo(token))(
            accessToken
          )

        const { sub: providerAccountId, email, name } = userInfo

        // --- Scenario (b): returning OAuth user ---
        // Check if this Google account has connected before
        const existingConnection: OAuthConnection | null =
          yield socialAuthService
            .getConnectionByProviderAccountId(
              provider as OAuthProviderEnum,
              providerAccountId
            )
            .pipe(
              bichain<Error, Error | null, OAuthConnection | null>(error =>
                isNotFound(error) ? resolve(null) : reject(error)
              )(connection => resolve(connection))
            )

        let user: User

        if (existingConnection != null) {
          // Returning user — fetch user by email
          user = yield accountService.getUserByEmail(email)

          // Refresh the stored tokens
          yield socialAuthService.upsertConnection({
            userId: existingConnection.userId,
            provider: 'google',
            providerAccountId,
            accessToken,
            refreshToken,
            expiresAt,
          })
        } else {
          // --- Scenario (a) / (c): new user or email already exists ---
          const existingUser: User | null = yield accountService
            .getUserByEmail(email)
            .pipe(
              bichain<Error, Error | null, User | null>(error =>
                isNotFound(error) ? resolve(null) : reject(error)
              )(u => resolve(u))
            )

          if (existingUser != null) {
            // --- Scenario (c): email already exists (password account) → link ---
            user = existingUser
          } else {
            // --- Scenario (a): brand new user → create account + user ---
            const account = yield accountService.createAccount(name || email)

            // OAuth users get an empty password — they can only log in via OAuth
            user = yield accountService.createUser(
              account.id,
              name || email,
              email,
              ''
            )
          }

          // Decode the encoded string id to numeric for the connections table
          const numericUserId = decodeId(user.id)

          if (numericUserId == null) {
            yield reject(badRequest('Could not resolve user ID'))
          }

          yield socialAuthService.upsertConnection({
            userId: numericUserId!,
            provider: 'google',
            providerAccountId,
            accessToken,
            refreshToken,
            expiresAt,
          })
        }

        // Create session and set cookie via onSend hook
        yield req.createSession(user)

        return user
      }) as FutureInstance<Error, User>

      // After successful login redirect to the app; respondWith handles errors
      respondWith(
        res,
        handleCallback.pipe(
          map(() => {
            res.redirect(env.REPRO_APP_URL)
          })
        ) as FutureInstance<Error, void>
      )
    })
  }
}
