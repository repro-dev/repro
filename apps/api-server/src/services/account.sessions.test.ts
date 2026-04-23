import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { Harness, createTestHarness } from '~/testing'
import { notFound } from '~/utils/errors'
import { AccountService } from './account'

describe('Services > Account', () => {
  let harness: Harness
  let accountService: AccountService

  before(async () => {
    harness = await createTestHarness()
    accountService = harness.services.accountService
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('Sessions', () => {
    it('should create a new session for a user', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const user = await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await expect(
        promise(accountService.createSession(user.id, 'user'))
      ).resolves.toMatchObject({
        id: expect.any(String),
        sessionToken: expect.any(String),
        subjectId: user.id,
        subjectType: 'user',
      })
    })

    it('should create a new session for a staff user', async () => {
      const staffUser = await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      await expect(
        promise(accountService.createSession(staffUser.id, 'staff'))
      ).resolves.toMatchObject({
        id: expect.any(String),
        sessionToken: expect.any(String),
        subjectId: staffUser.id,
        subjectType: 'staff',
      })
    })

    it('should get a session by session token', async () => {
      const staffUser = await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      const session = await promise(
        accountService.createSession(staffUser.id, 'staff')
      )

      await expect(
        promise(accountService.getSessionByToken(session.sessionToken))
      ).resolves.toMatchObject({ ...session })
    })

    it('should throw not-found when getting a non-existent session by session token', async () => {
      await expect(
        promise(accountService.getSessionByToken('does-not-exist'))
      ).rejects.toThrow(notFound())
    })

    it('should destroy a session', async () => {
      const staffUser = await promise(
        accountService.createStaffUser(
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2!'
        )
      )

      const session = await promise(
        accountService.createSession(staffUser.id, 'user')
      )

      await expect(
        promise(accountService.destroySession(session.sessionToken))
      ).resolves.toBeUndefined()

      await expect(
        promise(accountService.getSessionByToken(session.sessionToken))
      ).rejects.toThrow(notFound())
    })

    it('should throw not-found when destroying a non-existent session', async () => {
      await expect(
        promise(accountService.destroySession('does-not-exist'))
      ).rejects.toThrow(notFound())
    })

    it('should store a hashed token in the database, not the raw token', async () => {
      const account = await promise(accountService.createAccount('New Account'))

      const user = await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          harness.generateRandomEmailAddress(),
          'hunter2'
        )
      )

      const session = await promise(
        accountService.createSession(user.id, 'user')
      )

      // Query the DB directly to verify the stored value
      const row = await harness.db
        .selectFrom('sessions')
        .select('sessionTokenHash')
        .where('id', '=', decodeId(session.id))
        .executeTakeFirstOrThrow()

      // The raw token must not appear in the database
      expect(row.sessionTokenHash).not.toEqual(session.sessionToken)

      // SHA-256 digest in base64url is always 43 characters
      expect(row.sessionTokenHash).toHaveLength(43)
    })
  })
})
