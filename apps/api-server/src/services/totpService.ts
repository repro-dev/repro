import * as argon2 from '@node-rs/argon2'
import { decryptF, encryptF } from '@repro/encryption'
import { FutureInstance, attemptP, chain, map, reject, resolve } from 'fluture'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import * as otpauth from 'otpauth'
import * as qrcode from 'qrcode'
import { Env } from '~/config/createEnv'
import { Database, attemptQuery } from '~/modules/database'
import {
  badRequest,
  notFound,
  resourceConflict,
  serviceUnavailable,
} from '~/utils/errors'

// Character set for backup codes: alphanumeric excluding ambiguous chars (0,O,I,l,1)
const BACKUP_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const BACKUP_CODE_LENGTH = 10
const BACKUP_CODE_COUNT = 10
const MFA_PENDING_TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutes

function generateBackupCode(): string {
  let code = ''
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
    code += BACKUP_CODE_CHARS[randomInt(BACKUP_CODE_CHARS.length)]!
  }
  return code
}

function hashMfaToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export interface TotpSetupResult {
  secret: string
  otpauthUri: string
  qrDataUrl: string
}

export interface TotpConfirmResult {
  items: Array<string>
}

export interface TotpStatusResult {
  enabled: boolean
  backupCodesRemaining: number
}

export function createTotpService(database: Database, env: Env) {
  function getEncryptionKey(): FutureInstance<Error, string> {
    if (env.TOTP_ENCRYPTION_KEY) {
      return resolve(env.TOTP_ENCRYPTION_KEY)
    }
    return reject(
      serviceUnavailable(
        'TOTP_ENCRYPTION_KEY is not configured. TOTP 2FA cannot operate.'
      )
    )
  }

  function encryptSecret(plaintext: string): FutureInstance<Error, string> {
    return getEncryptionKey().pipe(
      chain(key =>
        encryptF(new TextEncoder().encode(plaintext).buffer, key).pipe(
          map(([ciphertext]) => {
            // Copy to an exact-sized buffer (Buffer.from pool may be oversized)
            const data = Buffer.from(new Uint8Array(ciphertext))
            return data.toString('base64url')
          })
        )
      )
    )
  }

  function decryptSecret(
    encryptedBase64: string
  ): FutureInstance<Error, string> {
    return getEncryptionKey().pipe(
      chain(key => {
        const decoded = Buffer.from(encryptedBase64, 'base64url')
        // Copy to an exact-sized buffer to avoid pooled .buffer being oversized
        const exact = Buffer.alloc(decoded.length)
        decoded.copy(exact)
        return decryptF(exact.buffer, key).pipe(
          map(decrypted => new TextDecoder().decode(decrypted))
        )
      })
    )
  }

  function setupTotp(
    userId: number,
    accountLabel: string
  ): FutureInstance<Error, TotpSetupResult> {
    const secret = new otpauth.Secret()
    const totp = new otpauth.TOTP({
      issuer: 'Repro',
      label: accountLabel,
      secret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    })

    const otpauthUri = totp.toString()

    // Generate QR code from the otpauth URI
    const qrFuture = attemptP<Error, string>(() => qrcode.toDataURL(otpauthUri))

    return qrFuture.pipe(
      chain(qrDataUrl =>
        encryptSecret(secret.base32).pipe(
          chain(encryptedSecret =>
            attemptQuery(async () => {
              // Check if TOTP is already enabled — reject if so
              const existing = await database
                .selectFrom('totp_credentials')
                .select('enabledAt')
                .where('userId', '=', userId)
                .executeTakeFirst()

              if (existing?.enabledAt != null) {
                throw resourceConflict('TOTP already enabled')
              }

              // Delete existing pending credential, insert new one
              await database
                .deleteFrom('totp_credentials')
                .where('userId', '=', userId)
                .execute()

              await database
                .insertInto('totp_credentials')
                .values({
                  userId,
                  secret: encryptedSecret,
                })
                .execute()
            }).pipe(
              map(() => ({ secret: secret.base32, otpauthUri, qrDataUrl }))
            )
          )
        )
      )
    )
  }

  function confirmTotp(
    userId: number,
    code: string
  ): FutureInstance<Error, TotpConfirmResult> {
    return attemptQuery(() =>
      database
        .selectFrom('totp_credentials')
        .select(['id', 'secret', 'enabledAt'])
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow(() => notFound('TOTP not set up'))
    ).pipe(
      chain(row => {
        if (row.enabledAt != null) {
          return reject(resourceConflict('TOTP already enabled'))
        }

        return decryptSecret(row.secret).pipe(
          chain(plainSecret => {
            const totp = new otpauth.TOTP({
              secret: otpauth.Secret.fromBase32(plainSecret),
              algorithm: 'SHA1',
              digits: 6,
              period: 30,
            })

            const delta = totp.validate({ token: code, window: 1 })
            if (delta === null) {
              return reject(badRequest('Invalid TOTP code'))
            }

            return attemptQuery(async () => {
              // Generate backup codes with async argon2 hashing
              const plaintextCodes: Array<string> = []
              const backupCodeInserts: Array<{
                userId: number
                codeHash: string
              }> = []
              const hashTasks: Array<Promise<void>> = []

              for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
                const code = generateBackupCode()
                plaintextCodes.push(code)
                hashTasks.push(
                  argon2.hash(code).then(hash => {
                    backupCodeInserts.push({
                      userId,
                      codeHash: hash,
                    })
                  })
                )
              }

              // Wait for all argon2 hashes in parallel
              await Promise.all(hashTasks)

              const now = new Date()

              // Use database.transaction() for atomic multi-statement mutation
              return database.transaction().execute(async tx => {
                await tx
                  .updateTable('totp_credentials')
                  .set({ enabledAt: now, lastUsedAt: now })
                  .where('id', '=', row.id)
                  .execute()

                // Delete old backup codes and insert new ones
                await tx
                  .deleteFrom('totp_backup_codes')
                  .where('userId', '=', userId)
                  .execute()

                await tx
                  .insertInto('totp_backup_codes')
                  .values(backupCodeInserts)
                  .execute()

                return { items: plaintextCodes }
              })
            })
          })
        )
      })
    )
  }

  function loadCredential(
    userId: number
  ): FutureInstance<
    Error,
    { id: number; secret: string; enabledAt: Date | null }
  > {
    return attemptQuery(() =>
      database
        .selectFrom('totp_credentials')
        .select(['id', 'secret', 'enabledAt'])
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow(() => notFound('TOTP not configured'))
    ).pipe(
      chain(row => {
        if (row.enabledAt == null) {
          return reject(badRequest('TOTP not yet confirmed'))
        }
        return resolve(row)
      })
    )
  }

  function verifyTotpCode(
    userId: number,
    code: string
  ): FutureInstance<Error, void> {
    return loadCredential(userId).pipe(
      chain(row =>
        decryptSecret(row.secret).pipe(
          chain(plainSecret => {
            const totp = new otpauth.TOTP({
              secret: otpauth.Secret.fromBase32(plainSecret),
              algorithm: 'SHA1',
              digits: 6,
              period: 30,
            })

            const delta = totp.validate({ token: code, window: 1 })
            if (delta === null) {
              return reject(badRequest('Invalid TOTP code'))
            }

            return attemptQuery(async () => {
              await database
                .updateTable('totp_credentials')
                .set({ lastUsedAt: new Date() })
                .where('id', '=', row.id)
                .execute()
            })
          })
        )
      )
    )
  }

  function verifyBackupCode(
    userId: number,
    code: string
  ): FutureInstance<Error, void> {
    return attemptQuery(async () => {
      const codes = await database
        .selectFrom('totp_backup_codes')
        .select(['id', 'codeHash'])
        .where('userId', '=', userId)
        .where('usedAt', 'is', null)
        .execute()

      // Perform constant-time argon2 work even when no codes remain,
      // to reduce timing/branch signal.
      let matchedId: number | null = null

      for (const row of codes) {
        const verified = await argon2.verify(row.codeHash, code)
        if (verified) {
          matchedId = row.id
        }
      }

      // Dummy verify when no codes exist to keep timing uniform
      if (codes.length === 0) {
        await argon2.verify('$argon2id$v=19$m=19456,t=2,p=1$YmVuY2htYXJr', code)
      }

      if (matchedId != null) {
        // Atomic consume: conditional UPDATE prevents double-spend race
        const result = await database
          .updateTable('totp_backup_codes')
          .set({ usedAt: new Date() })
          .where('id', '=', matchedId)
          .where('usedAt', 'is', null)
          .executeTakeFirst()

        if (result.numUpdatedRows === 0n) {
          throw badRequest('Invalid backup code')
        }

        return undefined as void
      }

      // Uniform error: same message whether codes were exhausted or code was wrong
      throw badRequest('Invalid backup code')
    })
  }

  function disableTotp(userId: number): FutureInstance<Error, void> {
    return attemptQuery(async () => {
      await database.transaction().execute(async tx => {
        await tx
          .deleteFrom('totp_credentials')
          .where('userId', '=', userId)
          .execute()

        await tx
          .deleteFrom('totp_backup_codes')
          .where('userId', '=', userId)
          .execute()
      })
    })
  }

  function createMfaPendingToken(
    userId: number
  ): FutureInstance<Error, string> {
    const rawToken = randomBytes(32).toString('base64url')
    const tokenHash = hashMfaToken(rawToken)

    return attemptQuery(async () => {
      // Opportunistic purge of expired tokens
      await database
        .deleteFrom('mfa_pending_tokens')
        .where(
          'createdAt',
          '<',
          new Date(Date.now() - MFA_PENDING_TOKEN_TTL_MS)
        )
        .execute()

      await database
        .insertInto('mfa_pending_tokens')
        .values({ userId, tokenHash })
        .execute()

      return rawToken
    })
  }

  function validateMfaPendingToken(
    token: string
  ): FutureInstance<Error, number> {
    const tokenHash = hashMfaToken(token)

    return attemptQuery(async () => {
      // Atomic delete-and-return: consumes the token in one statement,
      // preventing race conditions where two concurrent requests both
      // pass the existence check before either deletes.
      const rows = await database
        .deleteFrom('mfa_pending_tokens')
        .where('tokenHash', '=', tokenHash)
        .returning(['id', 'userId', 'createdAt'])
        .execute()

      if (rows.length === 0) {
        throw notFound('Invalid or expired MFA token')
      }

      const row = rows[0]!
      const now = Date.now()
      const createdAt = row.createdAt.getTime()

      if (now - createdAt > MFA_PENDING_TOKEN_TTL_MS) {
        throw badRequest('MFA token expired')
      }

      return row.userId
    })
  }

  function isTotpEnabled(userId: number): FutureInstance<Error, boolean> {
    return attemptQuery(async () => {
      const row = await database
        .selectFrom('totp_credentials')
        .select('enabledAt')
        .where('userId', '=', userId)
        .executeTakeFirst()

      return row?.enabledAt != null
    })
  }

  function getTotpStatus(
    userId: number
  ): FutureInstance<Error, TotpStatusResult> {
    return attemptQuery(async () => {
      const credential = await database
        .selectFrom('totp_credentials')
        .select('enabledAt')
        .where('userId', '=', userId)
        .executeTakeFirst()

      const enabled = credential?.enabledAt != null

      if (!enabled) {
        return { enabled: false, backupCodesRemaining: 0 }
      }

      const remaining = await database
        .selectFrom('totp_backup_codes')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('userId', '=', userId)
        .where('usedAt', 'is', null)
        .executeTakeFirst()

      return {
        enabled: true,
        backupCodesRemaining: Number(remaining?.count ?? 0),
      }
    })
  }

  function regenerateBackupCodes(
    userId: number
  ): FutureInstance<Error, { items: Array<string> }> {
    return isTotpEnabled(userId).pipe(
      chain(enabled => {
        if (!enabled) {
          return reject(badRequest('TOTP is not enabled'))
        }

        return attemptQuery(async () => {
          const plaintextCodes: Array<string> = []
          const backupCodeInserts: Array<{
            userId: number
            codeHash: string
          }> = []

          // Async argon2 hashing in parallel
          const hashTasks: Array<Promise<void>> = []
          for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
            const code = generateBackupCode()
            plaintextCodes.push(code)
            hashTasks.push(
              argon2.hash(code).then(hash => {
                backupCodeInserts.push({ userId, codeHash: hash })
              })
            )
          }
          await Promise.all(hashTasks)

          // Atomic delete-and-insert to prevent leaving zero backup codes on crash
          await database.transaction().execute(async tx => {
            await tx
              .deleteFrom('totp_backup_codes')
              .where('userId', '=', userId)
              .execute()

            await tx
              .insertInto('totp_backup_codes')
              .values(backupCodeInserts)
              .execute()
          })

          return { items: plaintextCodes }
        })
      })
    )
  }

  return {
    setupTotp,
    confirmTotp,
    verifyTotpCode,
    verifyBackupCode,
    disableTotp,
    createMfaPendingToken,
    validateMfaPendingToken,
    isTotpEnabled,
    getTotpStatus,
    regenerateBackupCodes,
  }
}

export type TotpService = ReturnType<typeof createTotpService>
