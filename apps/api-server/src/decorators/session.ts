import fastifyCookie from '@fastify/cookie'
import { Session, StaffUser, User } from '@repro/domain'
import { tap } from '@repro/future-utils'
import { addMinutes, min, parseISO } from 'date-fns'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  FutureInstance,
  chain,
  chainRej,
  done,
  map,
  reject,
  resolve,
} from 'fluture'
import { Env } from '~/config/createEnv'
import { AccountService } from '~/services/account'
import { ApiKeyService } from '~/services/apiKeys'
import { getSessionPolicy } from '~/services/sessionPolicy'
import { isNotFound, notAuthenticated } from '~/utils/errors'

declare module 'fastify' {
  interface FastifyRequest {
    session: Session | null
    user: User | StaffUser | null
    getCurrentUser(): FutureInstance<Error, User | StaffUser>
    getCurrentUserOrNull(): FutureInstance<Error, User | StaffUser | null>
    createSession(user: User | StaffUser): FutureInstance<Error, void>
    revokeSession(): FutureInstance<Error, void>
  }
}

type Request = FastifyRequest
type AnyFastifyInstance = FastifyInstance<any, any, any, any, any>

export function createSessionDecorator(
  accountService: AccountService,
  env: Env,
  apiKeyService?: ApiKeyService,
  options?: { staffPathPrefix?: string }
) {
  return function registerSessionDecorator(fastify: AnyFastifyInstance) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()
    const staffPathPrefix = options?.staffPathPrefix ?? '/staff'

    function resolveCookieName(req: Request): string {
      const path = (req.url ?? '').split('?')[0]!
      if (path === staffPathPrefix || path.startsWith(staffPathPrefix + '/')) {
        return env.STAFF_SESSION_COOKIE
      }
      return env.SESSION_COOKIE
    }

    function getSessionToken<T extends Request>(req: T) {
      const rawCookie = req.cookies[resolveCookieName(req)]

      if (rawCookie != null) {
        // Cookie is signed (value is "token.hmac_sig"). Unsign before lookup.
        const result = req.unsignCookie(rawCookie)

        if (!result.valid || result.value == null) {
          // Tampered or unsigned cookie — treat as absent.
          return undefined
        }

        return result.value
      }

      return req.headers.authorization?.replace(/^Bearer /i, '')
    }

    app.register(fastifyCookie, {
      secret: env.SESSION_SECRET,
    })

    app.decorateRequest<Session | null>('session', null)
    app.decorateRequest<User | StaffUser | null>('user', null)

    app.decorateRequest(
      'getCurrentUser',
      function getCurrentUser(): FutureInstance<Error, User | StaffUser> {
        const req = this

        if (req.user != null) {
          return resolve(req.user)
        }

        const sessionToken = req.session?.sessionToken

        if (sessionToken == null) {
          return reject(notAuthenticated())
        }

        // Synthetic session created by API key auth — bypass DB session lookup
        // and resolve the user directly.
        if (req.session?.id === '') {
          return accountService.getUserById(req.session.subjectId).pipe(
            tap(user => {
              req.user = user
            })
          )
        }

        const currentUser = accountService.getSessionByToken(sessionToken).pipe(
          chain<Error, Session, User | StaffUser>(session => {
            return session.subjectType === 'user'
              ? accountService.getUserById(session.subjectId)
              : accountService.getStaffUserById(session.subjectId)
          })
        )

        return currentUser.pipe(
          tap(user => {
            req.user = user
          })
        )
      }
    )

    app.decorateRequest(
      'getCurrentUserOrNull',
      function getCurrentUserOrNull(): FutureInstance<
        Error,
        User | StaffUser | null
      > {
        const req = this
        return req
          .getCurrentUser()
          .pipe(
            chainRej(error =>
              isNotFound(error) ? resolve(null) : reject(error)
            )
          )
      }
    )

    app.decorateRequest(
      'createSession',
      function createSession(
        user: User | StaffUser
      ): FutureInstance<Error, void> {
        const req = this
        return accountService
          .createSession(user.id, user.type)
          .pipe(
            tap(session => {
              req.session = session
            })
          )
          .pipe(map(() => undefined))
      }
    )

    app.decorateRequest(
      'revokeSession',
      function revokeSession(): FutureInstance<Error, void> {
        const req = this

        if (!req.session) {
          return resolve(undefined)
        }

        req.session.revoked = true

        return accountService.destroySession(req.session.sessionToken)
      }
    )

    app.addHook('onRequest', function onRequest(req, _, callback) {
      const sessionToken = getSessionToken(req)

      if (sessionToken == null) {
        return callback()
      }

      // First try to look up as a regular session token.
      // If not found and an API key service is available, fall back to
      // validating as a PAT (Bearer repro_<token>).
      const sessionFuture = accountService
        .getSessionByToken(sessionToken)
        .pipe(
          chainRej(error => {
            if (!isNotFound(error) || apiKeyService == null) {
              return reject(error)
            }

            // Fall back to API key validation
            return apiKeyService.validateApiKey(sessionToken).pipe(
              map(result => {
                if (result == null) {
                  return null
                }

                // Synthesise a transient Session-shaped object so that
                // existing route guards (`if (!req.session)`) and
                // `getCurrentUser()` work without modification.
                const syntheticSession: Session = {
                  id: '',
                  sessionToken,
                  subjectId: result.userId,
                  subjectType: 'user',
                  createdAt: new Date().toISOString(),
                }

                return syntheticSession as Session | null
              })
            )
          })
        )
        .pipe(
          chainRej(error => (isNotFound(error) ? resolve(null) : reject(error)))
        )
        .pipe(
          tap(session => {
            req.session = session
          })
        )

      done<Error, Session | null>(err => callback(err ?? undefined))(
        sessionFuture
      )
    })

    app.addHook('onSend', function onSend(req, res, _payload, callback) {
      if (req.session == null) {
        return callback()
      }

      if (req.session.revoked) {
        res.clearCookie(resolveCookieName(req))
        return callback()
      }

      // Don't write a Set-Cookie header for API key (synthetic) sessions —
      // the raw key must never be leaked into a cookie.
      if (req.session.id === '') {
        return callback()
      }

      const currentDate = new Date()
      const createdAt = parseISO(req.session.createdAt)
      const policy = getSessionPolicy(req.session.subjectType)

      // Policy values are in seconds; convert to minutes for date-fns.
      const expires = min([
        addMinutes(currentDate, policy.softExpirySeconds / 60),
        addMinutes(createdAt, policy.hardExpirySeconds / 60),
      ])

      res.setCookie(resolveCookieName(req), req.session.sessionToken, {
        httpOnly: true,
        path: '/',
        sameSite: 'none',
        secure: 'auto',
        signed: true,
        expires,
      })

      callback()
    })
  }
}
