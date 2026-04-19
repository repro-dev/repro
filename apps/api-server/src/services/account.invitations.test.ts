import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { encodeId } from '~/modules/database'
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

  describe('Invitations', () => {
    it('should create a new invitation', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      await expect(
        promise(accountService.createInvitation(account.id, email))
      ).resolves.toMatchObject({
        id: expect.any(String),
        token: expect.any(String),
        email,
      })
    })

    it('should reset the token when creating an invitation for an email that already exists', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const invitationA = await promise(
        accountService.createInvitation(account.id, email)
      )

      const invitationB = await promise(
        accountService.createInvitation(account.id, email)
      )

      expect(invitationA.id).toEqual(invitationB.id)
      expect(invitationA.email).toEqual(invitationB.email)
      expect(invitationA.token).not.toEqual(invitationB.token)
    })

    it('should deactivate an invitation', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const invitation = await promise(
        accountService.createInvitation(account.id, email)
      )

      await expect(
        promise(
          accountService.getInvitationByTokenAndEmail(
            invitation.token,
            invitation.email
          )
        )
      ).resolves.toMatchObject({ ...invitation })

      await expect(
        promise(accountService.deactivateInvitation(invitation.id))
      ).resolves.toBeUndefined()

      await expect(
        promise(
          accountService.getInvitationByTokenAndEmail(
            invitation.token,
            invitation.email
          )
        )
      ).rejects.toThrow(notFound())
    })

    it('should throw not-found when deactivating a non-existent invitation', async () => {
      await expect(
        promise(accountService.deactivateInvitation(encodeId(999)))
      ).rejects.toThrow(notFound())
    })

    it('should get an invitation by token and email address', async () => {
      const account = await promise(accountService.createAccount('New Account'))
      const email = harness.generateRandomEmailAddress()

      const invitation = await promise(
        accountService.createInvitation(account.id, email)
      )

      await expect(
        promise(
          accountService.getInvitationByTokenAndEmail(invitation.token, email)
        )
      ).resolves.toMatchObject({ ...invitation })
    })

    it('should throw not-found when getting a non-existent invitation by token and email address', async () => {
      await expect(
        promise(
          accountService.getInvitationByTokenAndEmail(
            encodeId(999),
            harness.generateRandomEmailAddress()
          )
        )
      ).rejects.toThrow(notFound())
    })
  })
})
