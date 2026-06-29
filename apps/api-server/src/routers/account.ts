import { Account, User } from '@repro/domain'
import { invitationEmail, passwordResetEmail } from '@repro/email'
import { tapF } from '@repro/future-utils'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  FutureInstance,
  bichain,
  both,
  chain,
  chainRej,
  go,
  map,
  reject,
  resolve,
} from 'fluture'

import z from 'zod'
import { defaultEnv as env } from '~/config/env'
import { defaultSystemConfig } from '~/config/system'
import { EmailModule } from '~/modules/email'
import { createRequestLogContext } from '~/modules/logger'
import { AccountService } from '~/services/account'
import { TransactionalEmailService } from '~/services/transactionalEmail'
import { isNotFound, notAuthenticated, resourceConflict } from '~/utils/errors'
import { getCurrentUserAccount } from '~/utils/request'
import { createResponseUtils } from '~/utils/response'

const registerSchema = {
  body: z.object({
    accountName: z.string(),
    userName: z.string(),
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
} as const

const inviteSchema = {
  body: z.object({
    email: z.string().email(),
  }),
} as const

const acceptInvitationSchema = {
  body: z.object({
    invitationToken: z.string(),
    name: z.string(),
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
} as const

const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
} as const

const verifySchema = {
  body: z.object({
    verificationToken: z.string().min(1),
    email: z.string().email(),
  }),
} as const

const resetPasswordRequestSchema = {
  body: z.object({
    email: z.string().email(),
  }),
} as const

const resetPasswordConfirmSchema = {
  body: z.object({
    token: z.string(),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  }),
} as const

const updateNameSchema = {
  body: z.object({
    name: z.string().trim().min(1, 'Account name is required'),
  }),
} as const

const updatePrivacyPresetSchema = {
  body: z.object({
    value: z.union([
      z.literal('strict'),
      z.literal('standard'),
      z.literal('off'),
    ]),
  }),
} as const

export function createAccountRouter(
  accountService: AccountService,
  emailModule: EmailModule,
  config = defaultSystemConfig,
  transactionalEmailService?: TransactionalEmailService
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  function createPasswordResetUrl(baseUrl: string, resetToken: string) {
    return new URL(`/account/reset-password/${resetToken}`, baseUrl).toString()
  }

  function createInvitationUrl(
    baseUrl: string,
    email: string,
    invitationToken: string
  ) {
    const url = new URL('/account/accept-invitation', baseUrl)
    url.searchParams.set('invitationToken', invitationToken)
    url.searchParams.set('email', email)
    return url.toString()
  }

  function ensureUserDoesNotExist(email: string): FutureInstance<Error, void> {
    return accountService
      .getUserByEmail(email)
      .pipe(
        bichain<Error, Error, void>(error =>
          isNotFound(error) ? resolve(undefined) : reject(error)
        )(() => reject(resourceConflict()))
      )
  }

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    app.post<{
      Body: z.infer<typeof registerSchema.body>
    }>(
      '/register',
      {
        schema: registerSchema,
        config: {
          rateLimit: {
            max: 10,
            timeWindow: '15 minutes',
          },
        },
      },
      (req, res) => {
        respondWith(
          res,
          go(function* () {
            const { account, user }: { account: Account; user: User } =
              yield accountService.createRegisteredAccount(
                req.body.accountName,
                req.body.userName,
                req.body.email,
                req.body.password
              )

            yield accountService.sendVerificationEmail(user.id, {
              context: {
                ...createRequestLogContext(req),
                accountId: account.id,
                targetUserId: user.id,
              },
            })

            yield req.createSession(user)

            return { account, user }
          }),
          201
        )
      }
    )

    app.post<{
      Body: z.infer<typeof inviteSchema.body>
    }>(
      '/invite',
      {
        schema: inviteSchema,
      },
      (req, res) => {
        const currentUser = req.getCurrentUser()

        const account = currentUser.pipe(
          chain(user =>
            accountService
              .ensureUser(user)
              .pipe(() => accountService.getAccountForUser(user.id))
          )
        )

        const invitation = both(currentUser)(account).pipe(
          chain(([user, account]) =>
            accountService.ensureCanModifyAccount(user, account.id).pipe(
              chain(() =>
                accountService
                  .createInvitation(account.id, req.body.email)
                  .pipe(
                    map(invitation => {
                      transactionalEmailService?.enqueue(
                        {
                          to: invitation.email,
                          from: emailModule.emailFromAddress,
                          ...invitationEmail({
                            invitationUrl: createInvitationUrl(
                              env.REPRO_APP_URL,
                              invitation.email,
                              invitation.token
                            ),
                            workspaceName: account.name,
                            inviterName: user.name,
                          }),
                        },
                        {
                          emailKind: 'invitation',
                          idempotencyKey: `email.send:invitation:${invitation.id}`,
                          context: {
                            ...createRequestLogContext(req),
                            accountId: account.id,
                            actorUserId: user.id,
                            invitationId: invitation.id,
                          },
                        }
                      )

                      return invitation
                    })
                  )
              )
            )
          )
        )

        respondWith(
          res,
          ensureUserDoesNotExist(req.body.email).pipe(chain(() => invitation)),
          201
        )
      }
    )

    app.post<{
      Body: z.infer<typeof acceptInvitationSchema.body>
    }>(
      '/accept-invitation',
      {
        schema: acceptInvitationSchema,
      },
      (req, res) => {
        const { invitationToken, name, email, password } = req.body

        respondWith(
          res,
          accountService
            .getInvitationByTokenAndEmail(invitationToken, email)
            .pipe(
              chain(invitation =>
                accountService.getAccountForInvitation(invitation.id)
              )
            )
            .pipe(
              chain(account =>
                accountService.createUser(account.id, name, email, password)
              )
            )
            .pipe(tapF(user => req.createSession(user))),
          201
        )
      }
    )

    app.post<{
      Body: z.infer<typeof loginSchema.body>
    }>(
      '/login',
      {
        schema: loginSchema,
        config: {
          rateLimit: {
            max: 20,
            timeWindow: '15 minutes',
          },
        },
      },
      (req, res) => {
        respondWith(
          res,
          accountService
            .ensureNotLocked(req.body.email)
            .pipe(
              chain(() =>
                accountService.getUserByEmailAndPassword(
                  req.body.email,
                  req.body.password
                )
              )
            )
            .pipe(
              chainRej(error => {
                if (isNotFound(error)) {
                  return accountService
                    .recordFailedLogin(req.body.email)
                    .pipe(chain(() => reject(notAuthenticated())))
                }

                return reject(error)
              })
            )
            .pipe(tapF(user => req.createSession(user)))
            .pipe(
              tapF(() => accountService.resetFailedLoginCount(req.body.email))
            )
        )
      }
    )

    app.post('/logout', (req, res) => {
      respondWith(res, req.revokeSession())
    })

    app.post<{
      Body: z.infer<typeof verifySchema.body>
    }>(
      '/verify',
      {
        schema: verifySchema,
      },
      (req, res) => {
        const ensureCurrentUserMatchesEmail = req
          .getCurrentUser()
          .pipe(
            chain(currentUser =>
              accountService.ensureUserMatchesEmail(currentUser, req.body.email)
            )
          )

        respondWith(
          res,
          ensureCurrentUserMatchesEmail.pipe(
            chain(() =>
              accountService.verifyUser(
                req.body.verificationToken,
                req.body.email
              )
            )
          )
        )
      }
    )

    app.post<{
      Body: z.infer<typeof resetPasswordRequestSchema.body>
    }>(
      '/reset-password',
      {
        schema: resetPasswordRequestSchema,
        config: {
          rateLimit: {
            // Limit to prevent email enumeration / abuse
            max: 5,
            timeWindow: '15 minutes',
          },
        },
      },
      (req, res) => {
        // Always respond 204 regardless of whether the email exists,
        // to prevent account enumeration attacks.
        respondWith(
          res,
          accountService.getUserByEmail(req.body.email).pipe(
            bichain<Error, Error, null>(error =>
              isNotFound(error) ? resolve(null) : reject(error)
            )(user =>
              accountService.createPasswordResetToken(user.id).pipe(
                map(token => {
                  transactionalEmailService?.enqueue(
                    {
                      to: user.email,
                      from: emailModule.emailFromAddress,
                      ...passwordResetEmail({
                        resetUrl: createPasswordResetUrl(
                          env.REPRO_APP_URL,
                          token
                        ),
                        userName: user.name,
                      }),
                    },
                    {
                      emailKind: 'password_reset',
                      idempotencyKey: `email.send:password_reset:${token}`,
                      context: {
                        ...createRequestLogContext(req),
                        targetUserId: user.id,
                      },
                    }
                  )

                  return null
                })
              )
            )
          )
        )
      }
    )

    app.post<{
      Body: z.infer<typeof resetPasswordConfirmSchema.body>
    }>(
      '/reset-password/confirm',
      {
        schema: resetPasswordConfirmSchema,
      },
      (req, res) => {
        respondWith(
          res,
          accountService.applyPasswordReset(
            req.body.token,
            req.body.newPassword
          )
        )
      }
    )

    app.get('/me', (req, res) => {
      respondWith(res, req.getCurrentUser())
    })

    app.get('/settings', (req, res) => {
      respondWith(
        res,
        getCurrentUserAccount(req, accountService).pipe(
          chain(({ user, account }) =>
            accountService
              .ensureUserIsAdmin(user)
              .pipe(
                chain(() =>
                  accountService.getAccountSettingsSummary(account.id)
                )
              )
          )
        )
      )
    })

    app.get('/privacy', (req, res) => {
      respondWith(
        res,
        getCurrentUserAccount(req, accountService).pipe(
          chain(({ user, account }) =>
            accountService
              .ensureUserIsAdmin(user)
              .pipe(
                chain(() =>
                  accountService
                    .getRecordingPrivacyPreset(account.id)
                    .pipe(map(value => ({ value })))
                )
              )
          )
        )
      )
    })

    app.put<{
      Body: z.infer<typeof updatePrivacyPresetSchema.body>
    }>(
      '/privacy',
      {
        schema: updatePrivacyPresetSchema,
      },
      (req, res) => {
        respondWith(
          res,
          getCurrentUserAccount(req, accountService).pipe(
            chain(({ user, account }) =>
              accountService
                .ensureUserIsAdmin(user)
                .pipe(
                  chain(() =>
                    accountService.updateRecordingPrivacyPreset(
                      account.id,
                      req.body.value
                    )
                  )
                )
            )
          )
        )
      }
    )

    app.put<{
      Body: z.infer<typeof updateNameSchema.body>
    }>(
      '/name',
      {
        schema: updateNameSchema,
      },
      (req, res) => {
        respondWith(
          res,
          getCurrentUserAccount(req, accountService).pipe(
            chain(({ user, account }) =>
              accountService
                .ensureUserIsAdmin(user)
                .pipe(
                  chain(() =>
                    accountService.updateAccountName(account.id, req.body.name)
                  )
                )
            )
          )
        )
      }
    )

    app.delete('/', (req, res) => {
      respondWith(
        res,
        getCurrentUserAccount(req, accountService).pipe(
          chain(({ user, account }) =>
            accountService
              .ensureUserIsAdmin(user)
              .pipe(chain(() => accountService.deactivateAccount(account.id)))
          )
        )
      )
    })

    app.get('/me/profile', (req, res) => {
      respondWith(
        res,
        req
          .getCurrentUser()
          .pipe(
            chain(user =>
              both(accountService.getUserProfile(user.id))(
                accountService.getAccountForUser(user.id)
              ).pipe(map(([profile, account]) => ({ ...profile, account })))
            )
          )
      )
    })

    app.put<{
      Body: z.infer<typeof updateNameSchema.body>
    }>(
      '/me/name',
      {
        schema: updateNameSchema,
      },
      (req, res) => {
        respondWith(
          res,
          req
            .getCurrentUser()
            .pipe(
              chain(user =>
                accountService.updateUserName(user.id, req.body.name)
              )
            )
        )
      }
    )

    app.post('/me/send-verification', (req, res) => {
      respondWith(
        res,
        req.getCurrentUser().pipe(
          chain(user =>
            accountService.sendVerificationEmail(user.id, {
              context: {
                ...createRequestLogContext(req),
                targetUserId: user.id,
              },
            })
          )
        )
      )
    })
  }
}
