import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { notFound } from '~/utils/errors'
import { createSocialAuthService } from './socialAuth'

describe('Services > SocialAuth', () => {
  let harness: Harness

  before(async () => {
    harness = await createTestHarness()
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('upsertConnection', () => {
    it('should create a new oauth_connection for an existing user', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const socialAuthService = createSocialAuthService(harness.db)

      const connection = await promise(
        socialAuthService.upsertConnection({
          userId,
          provider: 'google',
          providerAccountId: 'google-uid-123',
          accessToken: 'access-token-abc',
          refreshToken: 'refresh-token-xyz',
          expiresAt: new Date('2030-01-01'),
        })
      )

      expect(connection).toMatchObject({
        userId,
        provider: 'google',
        providerAccountId: 'google-uid-123',
      })
    })

    it('should update the tokens when a connection already exists for the same provider + providerAccountId', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const socialAuthService = createSocialAuthService(harness.db)

      await promise(
        socialAuthService.upsertConnection({
          userId,
          provider: 'google',
          providerAccountId: 'google-uid-123',
          accessToken: 'old-access-token',
          refreshToken: null,
          expiresAt: null,
        })
      )

      const updated = await promise(
        socialAuthService.upsertConnection({
          userId,
          provider: 'google',
          providerAccountId: 'google-uid-123',
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresAt: new Date('2030-06-01'),
        })
      )

      expect(updated.accessToken).toEqual('new-access-token')
      expect(updated.refreshToken).toEqual('new-refresh-token')
    })
  })

  describe('getConnectionByProviderAccountId', () => {
    it('should return the connection for a known providerAccountId', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])
      const userId = decodeId(user.id)!

      const socialAuthService = createSocialAuthService(harness.db)

      await promise(
        socialAuthService.upsertConnection({
          userId,
          provider: 'google',
          providerAccountId: 'google-uid-abc',
          accessToken: 'token',
          refreshToken: null,
          expiresAt: null,
        })
      )

      const found = await promise(
        socialAuthService.getConnectionByProviderAccountId(
          'google',
          'google-uid-abc'
        )
      )

      expect(found.userId).toEqual(userId)
      expect(found.provider).toEqual('google')
    })

    it('should reject with not-found for an unknown providerAccountId', async () => {
      const socialAuthService = createSocialAuthService(harness.db)

      await expect(
        promise(
          socialAuthService.getConnectionByProviderAccountId(
            'google',
            'nonexistent'
          )
        )
      ).rejects.toThrow(notFound())
    })
  })
})
