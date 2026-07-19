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
  fork,
  go,
  map,
  reject,
  resolve,
} from 'fluture'

import z from 'zod'
import { defaultEnv as env } from '~/config/env'
import { defaultSystemConfig } from '~/config/system'
import { decodeId, encodeId } from '~/modules/database/helpers'
import { EmailModule } from '~/modules/email'
import { createRequestLogContext } from '~/modules/logger'
import { AccountService } from '~/services/account'
import { TotpService } from '~/services/totpService'
import {
  isNotFound,
  notAuthenticated,
  permissionDenied,
  resourceConflict,
} from '~/utils/errors'
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

const totpConfirmSchema = {
  body: z.object({
    code: z.string().regex(/^\d{6}$/),
  }),
} as const

const totpSetupSchema = {
  body: z.object({
    accountLabel: z.string(),
  }),
} as const

const totpDisableSchema = {
  body: z.object({
    password: z.string(),
    code: z.string().regex(/^\d{6}$/),
  }),
} as const

const totpVerifySchema = {
  body: z.object({
    mfa_pending: z.string(),
    code: z.string(),
    codeType: z.enum(['totp', 'backup']),
  }),
} as const

export function createAccountRouter(
  accountService: AccountService,
  emailModule: EmailModule,
  totpService?: TotpService,
  config = defaultSystemConfig
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

  function getNumericUserId(encodedId: string): FutureInstance<Error, number> {
    const id = decodeId(encodedId)
    return id != null ? resolve(id) : reject(notAuthenticated())
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
                      emailModule.sendEmailInBackground(
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
        const { respondWithError, respondWithValue } =
          createResponseUtils(config)

        const loginBranch = go(function* () {
          const user: User = yield accountService
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

          if (totpService != null) {
            const numericId = yield getNumericUserId(user.id)
            const totpEnabled = yield totpService.isTotpEnabled(numericId)

            if (totpEnabled) {
              const mfaPending = yield totpService.createMfaPendingToken(
                numericId
              )
              return { mfa_pending: mfaPending, totpRequired: true as const }
            }
          }

          yield req.createSession(user)
          yield accountService.resetFailedLoginCount(req.body.email)
          return user
        })

        fork<Error>(error => respondWithError(res, error))<
          User | { mfa_pending: string; totpRequired: true }
        >(value => {
          if (
            typeof value === 'object' &&
            value != null &&
            'mfa_pending' in value
          ) {
            respondWithValue(res, value, 202)
          } else {
            respondWithValue(res, value)
          }
        })(loginBranch)
      }
    )

    // ─── TOTP routes (only available when totpService is wired) ────────────────

    if (totpService != null) {
      app.post<{
        Body: z.infer<typeof totpSetupSchema.body>
      }>('/totp/setup', { schema: totpSetupSchema }, (req, res) => {
        respondWith(
          res,
          req
            .getCurrentUser()
            .pipe(
              chain(user =>
                getNumericUserId(user.id).pipe(
                  chain(id => totpService.setupTotp(id, req.body.accountLabel))
                )
              )
            )
        )
      })

      app.post<{
        Body: z.infer<typeof totpConfirmSchema.body>
      }>(
        '/totp/confirm',
        {
          schema: totpConfirmSchema,
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
            req
              .getCurrentUser()
              .pipe(
                chain(user =>
                  getNumericUserId(user.id).pipe(
                    chain(id => totpService.confirmTotp(id, req.body.code))
                  )
                )
              )
          )
        }
      )

      app.post<{
        Body: z.infer<typeof totpDisableSchema.body>
      }>(
        '/totp/disable',
        {
          schema: totpDisableSchema,
          config: {
            rateLimit: {
              max: 5,
              timeWindow: '15 minutes',
            },
          },
        },
        (req, res) => {
          respondWith(
            res,
            req.getCurrentUser().pipe(
              chain(currentUser => {
                if (!('email' in currentUser) || currentUser.type !== 'user') {
                  return reject(permissionDenied())
                }
                const email = (currentUser as User).email
                return accountService
                  .getUserByEmailAndPassword(email, req.body.password)
                  .pipe(
                    chain(user =>
                      getNumericUserId(user.id).pipe(
                        chain(id =>
                          totpService
                            .verifyTotpCode(id, req.body.code)
                            .pipe(chain(() => totpService.disableTotp(id)))
                        )
                      )
                    )
                  )
              })
            )
          )
        }
      )

      app.post<{
        Body: z.infer<typeof totpVerifySchema.body>
      }>(
        '/totp/verify',
        {
          schema: totpVerifySchema,
          config: {
            rateLimit: {
              max: 10,
              timeWindow: '5 minutes',
            },
          },
        },
        (req, res) => {
          respondWith(
            res,
            go(function* () {
              const numericId = yield totpService.validateMfaPendingToken(
                req.body.mfa_pending
              )
              const userId = encodeId(numericId)
              const user = yield accountService.getUserById(userId)

              if (req.body.codeType === 'totp') {
                yield totpService.verifyTotpCode(numericId, req.body.code)
              } else {
                yield totpService.verifyBackupCode(numericId, req.body.code)
              }

              yield req.createSession(user)
              return user
            })
          )
        }
      )

      app.get('/totp/status', (req, res) => {
        respondWith(
          res,
          req
            .getCurrentUser()
            .pipe(
              chain(user =>
                getNumericUserId(user.id).pipe(
                  chain(id => totpService.getTotpStatus(id))
                )
              )
            )
        )
      })

      app.post('/totp/regenerate-backup-codes', (req, res) => {
        respondWith(
          res,
          req
            .getCurrentUser()
            .pipe(
              chain(user =>
                getNumericUserId(user.id).pipe(
                  chain(id => totpService.regenerateBackupCodes(id))
                )
              )
            )
        )
      })
    }

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
                  emailModule.sendEmailInBackground(
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
