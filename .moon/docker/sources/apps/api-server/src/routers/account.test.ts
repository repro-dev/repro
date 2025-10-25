import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { map, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { AccountService } from '~/services/account'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { notFound } from '~/utils/errors'
import { createAccountRouter } from './account'

describe('Routers > Account', () => {
  let harness: Harness
  let accountService: AccountService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    accountService = harness.services.accountService
    app = harness.bootstrap(createAccountRouter(accountService))
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('Account registration', () => {
    it('should register a new account and user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        body: {
          accountName: 'Repro Test',
          userName: 'John Smith',
          email: 'jsmith@example.com',
          password: 'hunter2',
        },
      })

      expect(res.statusCode).toEqual(201)
      expect(res.json()).toMatchObject({
        account: {
          id: expect.any(String),
          name: 'Repro Test',
        },

        user: {
          type: 'user',
          id: expect.any(String),
          name: 'John Smith',
        },
      })
    })

    it('should return resource-conflict and not create a new account or user for a duplicate email', async () => {
      const [account] = await harness.loadFixtures([fixtures.account.AccountA])

      await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          'jsmith@example.com',
          'hunter2'
        )
      )

      const res = await app.inject({
        method: 'POST',
        url: '/register',
        body: {
          accountName: 'Account for duplicate user',
          userName: 'John Smith',
          email: 'jsmith@example.com',
          password: 'hunter2',
        },
      })

      const allAccountNames = await promise(
        accountService
          .listAccounts()
          .pipe(map(accounts => accounts.map(account => account.name)))
      )

      expect(res.statusCode).toEqual(409)
      expect(allAccountNames).not.toContain('Account for duplicate user')
    })
  })

  describe('Login', () => {
    it('should create a new session when logging in with valid credentials', async () => {
      const [account] = await harness.loadFixtures([fixtures.account.AccountA])

      const user = await promise(
        accountService.createUser(
          account.id,
          'John Smith',
          'jsmith@example.com',
          'hunter2'
        )
      )

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        body: {
          email: 'jsmith@example.com',
          password: 'hunter2',
        },
      })

      const cookie = res.cookies.find(
        c => c.name === harness.env.SESSION_COOKIE
      )

      const sessionToken = cookie?.value

      expect(sessionToken).not.toBeUndefined()

      await expect(
        promise(accountService.getSessionByToken(sessionToken as string))
      ).resolves.toMatchObject({
        id: expect.any(String),
        sessionToken,
        subjectId: user.id,
        subjectType: 'user',
      })
    })

    it('should return not-authenticated when logging in with invalid credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        body: {
          email: 'imposter@example.net',
          password: 'nothunter2',
        },
      })

      const cookieNames = res.cookies.map(c => c.name)

      expect(cookieNames).not.toContain(harness.env.SESSION_COOKIE)
      expect(res.statusCode).toEqual(401)
    })
  })

  describe('Logout', () => {
    it('should revoke the current session when logging out', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      await app.inject({
        method: 'POST',
        url: '/logout',
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      await expect(
        promise(accountService.getSessionByToken(session.sessionToken))
      ).rejects.toThrow(notFound())
    })

    it('should be idempotent to attempt logging out with no active session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/logout',
      })

      expect(res.statusCode).toEqual(204)
    })
  })

  describe('Current user', () => {
    it('should return the current user', async () => {
      const [user, session] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/me',
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({ ...user })
    })

    it('should return not-found for the current user with no session', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/me',
      })

      expect(res.statusCode).toEqual(404)
    })
  })

  describe('Invitations', () => {
    it('should create an invitation for a user without an account', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/invite',
        body: {
          email: 'hello@example.com',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(201)
    })

    it.todo(
      'should enqueue a "send-invitation" task after creating an invitation'
    )

    it('should return resource-conflict when creating an invitation for a user that already exists', async () => {
      const [, session] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/invite',
        body: {
          email: 'user-a@example.com',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(409)
    })

    it('should regenerate token when re-inviting a user', async () => {
      const [account, session] = await harness.loadFixtures([
        fixtures.account.AccountA,
        fixtures.account.AdminUserA_Session,
      ])

      const invitation = await promise(
        accountService.createInvitation(account.id, 'hello@example.com')
      )

      const res = await app.inject({
        method: 'POST',
        url: '/invite',
        body: {
          email: 'hello@example.com',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      const newInvitation = await promise(
        accountService.getInvitationById(invitation.id)
      )

      expect(res.statusCode).toEqual(201)
      expect(newInvitation.token).not.toEqual(invitation.token)
    })

    it('should create a user and deactivate the invitation after accepting', async () => {
      const [account] = await harness.loadFixtures([fixtures.account.AccountA])

      const invitation = await promise(
        accountService.createInvitation(account.id, 'jsmith@example.com')
      )

      const res = await app.inject({
        method: 'POST',
        url: '/accept-invitation',
        body: {
          invitationToken: invitation.token,
          email: invitation.email,
          name: 'John Smith',
          password: 'hunter2',
        },
      })

      const user = await promise(
        accountService.getUserByEmailAndPassword(invitation.email, 'hunter2')
      )

      expect(res.statusCode).toEqual(201)
      expect(user).toMatchObject({
        id: expect.any(String),
        name: 'John Smith',
      })
    })

    it('should throw not-found when accepting an invitation that does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/accept-invitation',
        body: {
          invitationToken: 'does-not-exist',
          email: 'imposter@example.net',
          name: 'I.M. Poster',
          password: 'nothunter2',
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should throw not-found when accepting an invitation with a token/email mismatch', async () => {
      const [account] = await harness.loadFixtures([fixtures.account.AccountA])

      const invitation = await promise(
        accountService.createInvitation(account.id, 'jsmith@example.com')
      )

      const res = await app.inject({
        method: 'POST',
        url: '/accept-invitation',
        body: {
          invitationToken: invitation.token,
          email: 'imposter@example.com',
          name: 'John Smith',
          password: 'hunter2',
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should be possible to login with the newly-created user after accepting invitation', async () => {
      const [account] = await harness.loadFixtures([fixtures.account.AccountA])

      const invitation = await promise(
        accountService.createInvitation(account.id, 'jsmith@example.com')
      )

      await app.inject({
        method: 'POST',
        url: '/accept-invitation',
        body: {
          invitationToken: invitation.token,
          email: invitation.email,
          name: 'John Smith',
          password: 'hunter2',
        },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        body: {
          email: invitation.email,
          password: 'hunter2',
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({
        id: expect.any(String),
        name: 'John Smith',
      })
    })
  })

  describe('Verification', () => {
    it('should mark a user as unverified on registration', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        body: {
          accountName: 'New Account',
          userName: 'John Smith',
          email: 'jsmith@example.com',
          password: 'hunter2',
        },
      })

      expect(res.json()).toMatchObject({
        user: {
          id: expect.any(String),
          name: 'John Smith',
          verified: false,
        },
      })
    })

    it('should throw not-found when verifying without an active session', async () => {
      const [user] = await harness.loadFixtures([fixtures.account.UserA])

      const verificationToken = await harness.db
        .selectFrom('users')
        .select('verificationToken')
        .where('id', '=', decodeId(user.id))
        .executeTakeFirstOrThrow()
        .then(row => row.verificationToken)

      const res = await app.inject({
        method: 'POST',
        url: '/verify',
        body: {
          verificationToken,
          email: 'user-a@example.com',
        },
      })

      expect(res.statusCode).toEqual(404)

      await expect(
        promise(accountService.getUserById(user.id))
      ).resolves.toMatchObject({ verified: false })
    })

    it('should verify a user', async () => {
      const [user, session] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])

      const verificationToken = await harness.db
        .selectFrom('users')
        .select('verificationToken')
        .where('id', '=', decodeId(user.id))
        .executeTakeFirstOrThrow()
        .then(row => row.verificationToken)

      const res = await app.inject({
        method: 'POST',
        url: '/verify',
        body: {
          verificationToken,
          email: 'user-a@example.com',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      expect(
        promise(accountService.getUserById(user.id))
      ).resolves.toMatchObject({
        verified: true,
      })
    })

    it('should not be possible to verify another user', async () => {
      const [session, user] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
        fixtures.account.UserB,
      ])

      const verificationToken = await harness.db
        .selectFrom('users')
        .select('verificationToken')
        .where('id', '=', decodeId(user.id))
        .executeTakeFirstOrThrow()
        .then(row => row.verificationToken)

      const res = await app.inject({
        method: 'POST',
        url: '/verify',
        body: {
          verificationToken,
          email: 'user-b@example.com',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)

      await expect(
        promise(accountService.getUserById(user.id))
      ).resolves.not.toMatchObject({ verified: true })
    })
  })
})
