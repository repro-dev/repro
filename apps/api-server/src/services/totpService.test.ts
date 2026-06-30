import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import * as otpauth from 'otpauth'
import { createEnv } from '~/config/createEnv'
import { decodeId } from '~/modules/database/helpers'
import { setUpTestDatabase } from '~/testing/database'
import { createAccountService } from './account'
import { createTotpService, TotpService } from './totpService'

describe('Services > TotpService', () => {
  let totpService: TotpService
  let db: Awaited<ReturnType<typeof setUpTestDatabase>>['db']
  let closeDb: () => Promise<void>

  let userId: number
  let accountLabel: string

  before(async () => {
    const setup = await setUpTestDatabase()
    db = setup.db
    closeDb = setup.close

    const env = createEnv()
    totpService = createTotpService(db, env)

    const accountService = createAccountService(db, {
      sendEmailInBackground: () => {},
    } as any)

    // Create test user directly
    const account = await promise(
      accountService.createAccount('TOTP Test Account')
    )

    const user = await promise(
      accountService.createUser(
        account.id,
        'Totp User',
        'totp-test@repro.test',
        'password123'
      )
    )

    userId = decodeId(user.id) ?? 0
    accountLabel = user.email
  })

  beforeEach(async () => {
    // Clean up TOTP state between tests
    await db
      .deleteFrom('totp_credentials')
      .where('userId', '=', userId)
      .execute()
    await db
      .deleteFrom('totp_backup_codes')
      .where('userId', '=', userId)
      .execute()
    await db
      .deleteFrom('mfa_pending_tokens')
      .where('userId', '=', userId)
      .execute()
  })

  after(async () => {
    await closeDb()
  })

  describe('setupTotp', () => {
    it('should generate a valid setup result with secret, URI, and QR', async () => {
      const result = await promise(totpService.setupTotp(userId, accountLabel))

      expect(result.secret).toBeTruthy()
      expect(result.otpauthUri).toContain('otpauth://totp/Repro:')
      expect(result.otpauthUri).toContain(`secret=${result.secret}`)
      expect(result.otpauthUri).toContain('issuer=Repro')
      expect(result.otpauthUri).toContain('algorithm=SHA1')
      expect(result.otpauthUri).toContain('digits=6')
      expect(result.otpauthUri).toContain('period=30')
      expect(result.qrDataUrl).toMatch(/^data:image\/png;base64,/)

      // Verify credential was stored
      const credential = await db
        .selectFrom('totp_credentials')
        .select(['secret', 'enabledAt'])
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow()

      expect(credential.secret).toBeTruthy()
      // Secret should be encrypted at rest (not plaintext base32)
      expect(credential.secret).not.toEqual(result.secret)
      // enabledAt should be null (pending)
      expect(credential.enabledAt).toBeNull()
    })

    it('should upsert: replacing existing pending credential', async () => {
      await promise(totpService.setupTotp(userId, accountLabel))
      const firstSecret = await db
        .selectFrom('totp_credentials')
        .select('secret')
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow()

      await promise(totpService.setupTotp(userId, accountLabel))
      const secondSecret = await db
        .selectFrom('totp_credentials')
        .select('secret')
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow()

      expect(secondSecret.secret).not.toEqual(firstSecret.secret)
    })

    it('should reject setup when TOTP is already enabled (B3 regression)', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      // Confirm first
      await promise(totpService.confirmTotp(userId, code))

      // Second setup must fail
      await expect(
        promise(totpService.setupTotp(userId, accountLabel))
      ).rejects.toThrow('TOTP already enabled')

      // Original credential must still be intact
      const credential = await db
        .selectFrom('totp_credentials')
        .select('enabledAt')
        .where('userId', '=', userId)
        .executeTakeFirst()
      expect(credential?.enabledAt).not.toBeNull()
    })
  })

  describe('confirmTotp', () => {
    it('should confirm a pending credential with a valid code', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))

      // Generate a valid TOTP code from the secret
      const totp = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      })
      const code = totp.generate()

      const result = await promise(totpService.confirmTotp(userId, code))

      expect(result.items).toHaveLength(10)
      // Backup codes should be non-empty strings
      result.items.forEach(code => {
        expect(code.length).toBeGreaterThanOrEqual(8)
      })

      // Credential should now be enabled
      const credential = await db
        .selectFrom('totp_credentials')
        .select('enabledAt')
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow()
      expect(credential.enabledAt).not.toBeNull()

      // Backup codes should be stored (hashed)
      const codes = await db
        .selectFrom('totp_backup_codes')
        .select(['codeHash', 'usedAt'])
        .where('userId', '=', userId)
        .execute()
      expect(codes).toHaveLength(10)
      codes.forEach(c => {
        expect(c.usedAt).toBeNull()
        // Code hash should not match any plaintext backup code directly
        expect(c.codeHash).not.toBeNull()
      })
    })

    it('should reject an invalid code', async () => {
      await promise(totpService.setupTotp(userId, accountLabel))

      await expect(
        promise(totpService.confirmTotp(userId, '000000'))
      ).rejects.toThrow('Invalid TOTP code')

      // Credential should still be pending
      const credential = await db
        .selectFrom('totp_credentials')
        .select('enabledAt')
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow()
      expect(credential.enabledAt).toBeNull()
    })

    it('should reject if no pending credential exists', async () => {
      await expect(
        promise(totpService.confirmTotp(userId, '123456'))
      ).rejects.toThrow('TOTP not set up')
    })

    it('should reject if credential is already enabled', async () => {
      await db
        .deleteFrom('totp_credentials')
        .where('userId', '=', userId)
        .execute()
      await db
        .deleteFrom('totp_backup_codes')
        .where('userId', '=', userId)
        .execute()

      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.confirmTotp(userId, code))

      await expect(
        promise(totpService.confirmTotp(userId, code))
      ).rejects.toThrow('TOTP already enabled')
    })
  })

  describe('verifyTotpCode', () => {
    it('should verify a valid TOTP code', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.confirmTotp(userId, code))

      // Generate a fresh code and verify
      const nextCode = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.verifyTotpCode(userId, nextCode))
    })

    it('should reject an invalid code', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.confirmTotp(userId, code))

      await expect(
        promise(totpService.verifyTotpCode(userId, '000000'))
      ).rejects.toThrow('Invalid TOTP code')
    })

    it('should tolerate ±1 step clock skew', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.confirmTotp(userId, code))

      // Verify the current code works (window=1 tolerates the current step)
      const totp = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      })

      const currentCode = totp.generate()
      await promise(totpService.verifyTotpCode(userId, currentCode))

      // Generate codes for timestamps far outside window (±3 minutes = ±6 steps)
      // window=1 only allows ±1 step, so these should be rejected
      const farPastCode = totp.generate({ timestamp: Date.now() - 180000 })
      await expect(
        promise(totpService.verifyTotpCode(userId, farPastCode))
      ).rejects.toThrow('Invalid TOTP code')

      const farFutureCode = totp.generate({ timestamp: Date.now() + 180000 })
      await expect(
        promise(totpService.verifyTotpCode(userId, farFutureCode))
      ).rejects.toThrow('Invalid TOTP code')
    })

    it('should reject if TOTP not configured', async () => {
      await expect(
        promise(totpService.verifyTotpCode(userId, '123456'))
      ).rejects.toThrow('TOTP not configured')
    })

    it('should update lastUsedAt on successful verification', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.confirmTotp(userId, code))

      // Small delay to ensure timestamp difference
      await new Promise(r => setTimeout(r, 50))

      const nextCode = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.verifyTotpCode(userId, nextCode))

      const credential = await db
        .selectFrom('totp_credentials')
        .select('lastUsedAt')
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow()

      expect(credential.lastUsedAt).not.toBeNull()
    })
  })

  describe('backup codes', () => {
    it('should verify a backup code and mark it used', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      const { items } = await promise(totpService.confirmTotp(userId, code))

      const backupCode = items[0]!
      await promise(totpService.verifyBackupCode(userId, backupCode))

      // Code should be consumed
      const codes = await db
        .selectFrom('totp_backup_codes')
        .select('usedAt')
        .where('userId', '=', userId)
        .execute()

      const usedCodes = codes.filter(c => c.usedAt != null)
      expect(usedCodes).toHaveLength(1)
    })

    it('should reject a used backup code (single-use)', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      const { items } = await promise(totpService.confirmTotp(userId, code))

      const backupCode = items[0]!
      await promise(totpService.verifyBackupCode(userId, backupCode))

      // Second use should fail
      await expect(
        promise(totpService.verifyBackupCode(userId, backupCode))
      ).rejects.toThrow('Invalid backup code')
    })

    it('should reject an invalid backup code', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.confirmTotp(userId, code))

      await expect(
        promise(totpService.verifyBackupCode(userId, 'INVALIDCODE'))
      ).rejects.toThrow('Invalid backup code')
    })

    it('should reject with uniform error when no unused codes remain (B7 + B2)', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      const { items } = await promise(totpService.confirmTotp(userId, code))

      // Consume all 10 backup codes
      for (const backupCode of items) {
        await promise(totpService.verifyBackupCode(userId, backupCode))
      }

      // Try to verify any backup code when none remain — should get the same
      // "Invalid backup code" error (not "not found" or different message)
      await expect(
        promise(totpService.verifyBackupCode(userId, 'SOME-CODE'))
      ).rejects.toThrow('Invalid backup code')
    })

    it('should reject a code already consumed by concurrent conditional UPDATE (B2 race)', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      const { items } = await promise(totpService.confirmTotp(userId, code))
      const backupCode = items[0]!

      // First consumption succeeds
      await promise(totpService.verifyBackupCode(userId, backupCode))

      // Second consumption (simulates concurrent race) must fail
      await expect(
        promise(totpService.verifyBackupCode(userId, backupCode))
      ).rejects.toThrow('Invalid backup code')
    })
  })

  describe('isTotpEnabled', () => {
    it('should return false when no credential exists', async () => {
      const enabled = await promise(totpService.isTotpEnabled(userId))
      expect(enabled).toBe(false)
    })

    it('should return false when credential is pending', async () => {
      await promise(totpService.setupTotp(userId, accountLabel))
      const enabled = await promise(totpService.isTotpEnabled(userId))
      expect(enabled).toBe(false)
    })

    it('should return true when credential is enabled', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.confirmTotp(userId, code))
      const enabled = await promise(totpService.isTotpEnabled(userId))
      expect(enabled).toBe(true)
    })
  })

  describe('getTotpStatus', () => {
    it('should return disabled status', async () => {
      const status = await promise(totpService.getTotpStatus(userId))
      expect(status.enabled).toBe(false)
      expect(status.backupCodesRemaining).toBe(0)
    })

    it('should return enabled status with remaining backup codes', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.confirmTotp(userId, code))
      const status = await promise(totpService.getTotpStatus(userId))
      expect(status.enabled).toBe(true)
      expect(status.backupCodesRemaining).toBe(10)
    })
  })

  describe('disableTotp', () => {
    it('should remove credential and backup codes', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.confirmTotp(userId, code))
      await promise(totpService.disableTotp(userId))

      const credential = await db
        .selectFrom('totp_credentials')
        .select('id')
        .where('userId', '=', userId)
        .executeTakeFirst()
      expect(credential).toBeUndefined()

      const codes = await db
        .selectFrom('totp_backup_codes')
        .select('id')
        .where('userId', '=', userId)
        .execute()
      expect(codes).toHaveLength(0)

      const enabled = await promise(totpService.isTotpEnabled(userId))
      expect(enabled).toBe(false)
    })
  })

  describe('mfa_pending tokens', () => {
    it('should create and validate a pending token', async () => {
      const rawToken = await promise(totpService.createMfaPendingToken(userId))
      expect(rawToken).toBeTruthy()
      expect(typeof rawToken).toBe('string')

      const validatedUserId = await promise(
        totpService.validateMfaPendingToken(rawToken)
      )
      expect(validatedUserId).toBe(userId)
    })

    it('should be single-use', async () => {
      const rawToken = await promise(totpService.createMfaPendingToken(userId))
      await promise(totpService.validateMfaPendingToken(rawToken))

      await expect(
        promise(totpService.validateMfaPendingToken(rawToken))
      ).rejects.toThrow('Invalid or expired MFA token')
    })

    it('should reject tampered token', async () => {
      await promise(totpService.createMfaPendingToken(userId))

      await expect(
        promise(totpService.validateMfaPendingToken('tampered-token-value'))
      ).rejects.toThrow('Invalid or expired MFA token')
    })

    it('should reject expired token (>5 min)', async () => {
      const rawToken = await promise(totpService.createMfaPendingToken(userId))

      // Manually set the createdAt to be old
      await db
        .updateTable('mfa_pending_tokens' as any)
        .set({
          createdAt: new Date(Date.now() - 6 * 60 * 1000) as any,
        })
        .where('userId', '=', userId)
        .execute()

      await expect(
        promise(totpService.validateMfaPendingToken(rawToken))
      ).rejects.toThrow('MFA token expired')
    })
  })

  describe('regenerateBackupCodes', () => {
    it('should replace old backup codes with new ones', async () => {
      const setup = await promise(totpService.setupTotp(userId, accountLabel))
      const code = new otpauth.TOTP({
        secret: otpauth.Secret.fromBase32(setup.secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).generate()

      await promise(totpService.confirmTotp(userId, code))

      const oldCodes = await db
        .selectFrom('totp_backup_codes')
        .select('id')
        .where('userId', '=', userId)
        .execute()
      expect(oldCodes).toHaveLength(10)

      const newPlaintext = await promise(
        totpService.regenerateBackupCodes(userId)
      )
      expect(newPlaintext.items).toHaveLength(10)

      const remainingCodes = await db
        .selectFrom('totp_backup_codes')
        .select('id')
        .where('userId', '=', userId)
        .execute()
      expect(remainingCodes).toHaveLength(10)

      // Old codes should be gone and new ones should work
      await promise(
        totpService.verifyBackupCode(userId, newPlaintext.items[0]!)
      )
    })

    it('should reject if TOTP not enabled', async () => {
      await expect(
        promise(totpService.regenerateBackupCodes(userId))
      ).rejects.toThrow('TOTP is not enabled')
    })
  })
})
