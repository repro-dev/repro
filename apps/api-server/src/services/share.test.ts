import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createTestHarness, fixtures, Harness } from '~/testing'
import { notFound } from '~/utils/errors'
import { createShareService, ShareService } from './share'

describe('Services > Share', () => {
  let harness: Harness
  let shareService: ShareService

  before(async () => {
    harness = await createTestHarness()
    shareService = createShareService(harness.db, 'http://localhost:5173')
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  it('should create a share token for a recording', async () => {
    const [recording, user] = await harness.loadFixtures([
      fixtures.recording.RecordingA,
      fixtures.account.UserA,
    ])

    const shareToken = await promise(
      shareService.createShareToken('recording', recording.id, user.id, null)
    )

    expect(shareToken).toMatchObject({
      id: expect.any(String),
      token: expect.any(String),
      resourceType: 'recording',
      resourceId: expect.any(String),
      createdBy: expect.any(String),
      expiresAt: null,
      revokedAt: null,
      shareUrl: expect.stringContaining('/share/'),
    })
  })

  it('should create a share token with an expiry', async () => {
    const [recording, user] = await harness.loadFixtures([
      fixtures.recording.RecordingA,
      fixtures.account.UserA,
    ])

    const expiresAt = new Date(Date.now() + 86400000).toISOString()

    const shareToken = await promise(
      shareService.createShareToken(
        'recording',
        recording.id,
        user.id,
        expiresAt
      )
    )

    expect(shareToken.expiresAt).not.toBeNull()
  })

  it('should resolve a valid share token', async () => {
    const [recording, user] = await harness.loadFixtures([
      fixtures.recording.RecordingA,
      fixtures.account.UserA,
    ])

    const created = await promise(
      shareService.createShareToken('recording', recording.id, user.id, null)
    )

    const resolved = await promise(
      shareService.resolveShareToken(created.token)
    )

    expect(resolved).toMatchObject({
      token: created.token,
      resourceType: 'recording',
    })
  })

  it('should reject an unknown share token', async () => {
    await expect(
      promise(shareService.resolveShareToken('nonexistent-token'))
    ).rejects.toThrow(notFound('Share token not found'))
  })

  it('should revoke a share token', async () => {
    const [recording, user] = await harness.loadFixtures([
      fixtures.recording.RecordingA,
      fixtures.account.UserA,
    ])

    const created = await promise(
      shareService.createShareToken('recording', recording.id, user.id, null)
    )

    await expect(
      promise(shareService.revokeShareToken(created.id, user.id))
    ).resolves.toBeUndefined()

    await expect(
      promise(shareService.resolveShareToken(created.token))
    ).rejects.toThrow(notFound('Share token has been revoked'))
  })

  it('should list share tokens for a recording', async () => {
    const [recording, user] = await harness.loadFixtures([
      fixtures.recording.RecordingA,
      fixtures.account.UserA,
    ])

    await promise(
      shareService.createShareToken('recording', recording.id, user.id, null)
    )

    await promise(
      shareService.createShareToken('recording', recording.id, user.id, null)
    )

    const tokens = await promise(
      shareService.listShareTokens('recording', recording.id)
    )

    expect(tokens).toHaveLength(2)
  })

  it('should reject creating a share token with invalid resource ID', async () => {
    const user = await harness.loadFixtures([fixtures.account.UserA])

    await expect(
      promise(
        shareService.createShareToken(
          'recording',
          'invalid-id',
          user[0]!.id,
          null
        )
      )
    ).rejects.toThrow()
  })
})
