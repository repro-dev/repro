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
import { isNotFound, notFound } from '~/utils/errors'

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

export function createSessionDecorator(
  accountService: AccountService,
  env: Env
) {
  return function registerSessionDecorator(fastify: FastifyInstance) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    function getSessionToken<T extends Request>(req: T) {
      return (
        req.cookies[env.SESSION_COOKIE] ??
        req.headers.authorization?.replace(/^Bearer /i, '')
      )
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
          return reject(notFound())
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

      done<Error, Session | null>(err => callback(err ?? undefined))(
        accountService
          .getSessionByToken(sessionToken)
          .pipe(
            chainRej(error =>
              isNotFound(error) ? resolve(null) : reject(error)
            )
          )
          .pipe(
            tap(session => {
              req.session = session
            })
          )
      )
    })

    app.addHook('onSend', function onSend(req, res, _payload, callback) {
      if (req.session == null) {
        return callback()
      }

      if (req.session.revoked) {
        res.clearCookie(env.SESSION_COOKIE)
        return callback()
      }

      const currentDate = new Date()
      const createdAt = parseISO(req.session.createdAt)

      const expires = min([
        addMinutes(currentDate, env.SESSION_SOFT_EXPIRY),
        addMinutes(createdAt, env.SESSION_HARD_EXPIRY),
      ])

      res.setCookie(env.SESSION_COOKIE, req.session.sessionToken, {
        httpOnly: true,
        path: '/',
        sameSite: 'none',
        secure: 'auto',
        expires,
      })

      callback()
    })
  }
}
