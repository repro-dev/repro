import * as argon2 from '@node-rs/argon2'
import { createExportedKeyF, decryptF, encryptF } from '@repro/encryption'
import { FutureInstance, attemptP, chain, map, reject, resolve } from 'fluture'
import { createHash, randomBytes } from 'node:crypto'
import * as otpauth from 'otpauth'
import * as qrcode from 'qrcode'
import { Env } from '~/config/createEnv'
import { Database, attemptQuery } from '~/modules/database'
import { badRequest, notFound, resourceConflict } from '~/utils/errors'

// Character set for backup codes: alphanumeric excluding ambiguous chars (0,O,I,l,1)
const BACKUP_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const BACKUP_CODE_LENGTH = 10
const BACKUP_CODE_COUNT = 10
const MFA_PENDING_TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutes

function generateBackupCode(): string {
  const bytes = randomBytes(BACKUP_CODE_LENGTH)
  let code = ''
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
    code += BACKUP_CODE_CHARS[bytes[i]! % BACKUP_CODE_CHARS.length]
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
  backupCodes: Array<string>
}

export interface TotpStatusResult {
  enabled: boolean
  backupCodesRemaining: number
}

export function createTotpService(database: Database, env: Env) {
  // Cache the generated key so encrypt/decrypt within a session use the same key
  let _cachedKey: string | null = null

  function getEncryptionKey(): FutureInstance<Error, string> {
    if (env.TOTP_ENCRYPTION_KEY) {
      return resolve(env.TOTP_ENCRYPTION_KEY)
    }
    if (_cachedKey != null) {
      return resolve(_cachedKey)
    }
    return createExportedKeyF().pipe(
      map(key => {
        _cachedKey = key
        return key
      })
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
            // Upsert: delete existing pending credential, insert new one
            attemptQuery(async () => {
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

            // Generate backup codes
            const plaintextCodes: Array<string> = []
            const backupCodeInserts: Array<{
              userId: number
              codeHash: string
            }> = []

            for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
              const code = generateBackupCode()
              plaintextCodes.push(code)
              backupCodeInserts.push({
                userId,
                codeHash: argon2.hashSync(code),
              })
            }

            return attemptQuery(async () => {
              const now = new Date()
              await database
                .updateTable('totp_credentials')
                .set({ enabledAt: now, lastUsedAt: now })
                .where('id', '=', row.id)
                .execute()

              // Delete old backup codes and insert new ones
              await database
                .deleteFrom('totp_backup_codes')
                .where('userId', '=', userId)
                .execute()

              await database
                .insertInto('totp_backup_codes')
                .values(backupCodeInserts)
                .execute()
            }).pipe(map(() => ({ backupCodes: plaintextCodes })))
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

      if (codes.length === 0) {
        throw notFound('No unused backup codes')
      }

      for (const row of codes) {
        const verified = await argon2.verify(row.codeHash, code)
        if (verified) {
          await database
            .updateTable('totp_backup_codes')
            .set({ usedAt: new Date() })
            .where('id', '=', row.id)
            .execute()

          return undefined as void
        }
      }

      throw badRequest('Invalid backup code')
    })
  }

  function disableTotp(userId: number): FutureInstance<Error, void> {
    return attemptQuery(async () => {
      await database
        .deleteFrom('totp_credentials')
        .where('userId', '=', userId)
        .execute()

      await database
        .deleteFrom('totp_backup_codes')
        .where('userId', '=', userId)
        .execute()
    })
  }

  function createMfaPendingToken(
    userId: number
  ): FutureInstance<Error, string> {
    const rawToken = randomBytes(32).toString('base64url')
    const tokenHash = hashMfaToken(rawToken)

    return attemptQuery(async () => {
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
      const rows = await database
        .selectFrom('mfa_pending_tokens')
        .select(['id', 'userId', 'createdAt'])
        .where('tokenHash', '=', tokenHash)
        .execute()

      if (rows.length === 0) {
        throw notFound('Invalid or expired MFA token')
      }

      // Delete all rows for this hash (single-use)
      await database
        .deleteFrom('mfa_pending_tokens')
        .where('tokenHash', '=', tokenHash)
        .execute()

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
  ): FutureInstance<Error, Array<string>> {
    return isTotpEnabled(userId).pipe(
      chain(enabled => {
        if (!enabled) {
          return reject(badRequest('TOTP is not enabled'))
        }

        const plaintextCodes: Array<string> = []
        const backupCodeInserts: Array<{
          userId: number
          codeHash: string
        }> = []

        for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
          const code = generateBackupCode()
          plaintextCodes.push(code)
          backupCodeInserts.push({
            userId,
            codeHash: argon2.hashSync(code),
          })
        }

        return attemptQuery(async () => {
          await database
            .deleteFrom('totp_backup_codes')
            .where('userId', '=', userId)
            .execute()

          await database
            .insertInto('totp_backup_codes')
            .values(backupCodeInserts)
            .execute()
        }).pipe(map(() => plaintextCodes))
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
    getEncryptionKey,
  }
}

export type TotpService = ReturnType<typeof createTotpService>
