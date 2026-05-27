import { ProjectRole } from '@repro/domain'
import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { fixtures } from '~/testing'
import { notFound } from '~/utils/errors'
import {
  AccountTestContext,
  attemptLogin,
  createAccountTestContext,
  getSessionTokenFromResponse,
} from './account.test-utils'

describe('Routers > Account > Auth', () => {
  let context: AccountTestContext

  before(async () => {
    context = await createAccountTestContext()
  })

  beforeEach(async () => {
    await context.harness.reset()
  })

  after(async () => {
    await context.harness.close()
  })

  describe('Password policy', () => {
    it('should reject registration with a password shorter than 8 characters', async () => {
      const res = await context.app.inject({
        method: 'POST',
        url: '/register',
        body: {
          accountName: 'Repro Test',
          userName: 'John Smith',
          email: 'jsmith@example.com',
          password: 'short',
        },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('should reject invitation acceptance with a password shorter than 8 characters', async () => {
      const [account] = await context.harness.loadFixtures([
        fixtures.account.AccountA,
      ])

      const invitation = await promise(
        context.accountService.createInvitation(
          account.id,
          'jsmith@example.com'
        )
      )

      const res = await context.app.inject({
        method: 'POST',
        url: '/accept-invitation',
        body: {
          invitationToken: invitation.token,
          email: invitation.email,
          name: 'John Smith',
          password: 'short',
        },
      })

      expect(res.statusCode).toEqual(400)
    })
  })

  describe('Account registration', () => {
    it('should register a new account and user', async () => {
      const res = await context.app.inject({
        method: 'POST',
        url: '/register',
        body: {
          accountName: 'Repro Test',
          userName: 'John Smith',
          email: 'jsmith@example.com',
          password: 'hunter2!',
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

      const { user } = res.json()
      const projects = await promise(
        context.projectService.getUserProjects(user.id)
      )

      expect(projects).toEqual([
        {
          id: expect.any(String),
          name: 'My Project',
        },
      ])
      const defaultProject = projects[0]

      if (defaultProject == null) {
        throw new Error('Expected registration to create a default project')
      }

      await expect(
        promise(
          context.projectService.getUserProjectRole(user.id, defaultProject.id)
        )
      ).resolves.toEqual(ProjectRole.Admin)
    })

    it('should create a session on registration', async () => {
      const res = await context.app.inject({
        method: 'POST',
        url: '/register',
        body: {
          accountName: 'Repro Test',
          userName: 'John Smith',
          email: 'jsmith@example.com',
          password: 'hunter2!',
        },
      })

      expect(res.statusCode).toEqual(201)

      const sessionToken = getSessionTokenFromResponse(
        res,
        context.harness.env.SESSION_COOKIE,
        context.harness.env.SESSION_SECRET
      )

      await expect(
        promise(context.accountService.getSessionByToken(sessionToken))
      ).resolves.toMatchObject({
        id: expect.any(String),
        sessionToken,
        subjectType: 'user',
      })
    })

    it('should return resource-conflict and not create a new account, user, project, or membership for a duplicate email', async () => {
      const [account] = await context.harness.loadFixtures([
        fixtures.account.AccountA,
      ])

      const user = await promise(
        context.accountService.createUser(
          account.id,
          'John Smith',
          'jsmith@example.com',
          'hunter2!'
        )
      )

      const accountsBefore = (
        await promise(context.accountService.listAccounts())
      ).items
      const usersBefore = await context.harness.db
        .selectFrom('users')
        .select('id')
        .execute()
      const projectsBefore = await context.harness.db
        .selectFrom('projects')
        .select('id')
        .execute()
      const membershipsBefore = await context.harness.db
        .selectFrom('memberships')
        .select('userId')
        .execute()

      const res = await context.app.inject({
        method: 'POST',
        url: '/register',
        body: {
          accountName: 'Account for duplicate user',
          userName: 'John Smith',
          email: 'jsmith@example.com',
          password: 'hunter2!',
        },
      })

      const allAccountNames = (
        await promise(context.accountService.listAccounts())
      ).items.map(account => account.name)
      const usersAfter = await context.harness.db
        .selectFrom('users')
        .select('id')
        .execute()
      const projectsAfter = await context.harness.db
        .selectFrom('projects')
        .select('id')
        .execute()
      const membershipsAfter = await context.harness.db
        .selectFrom('memberships')
        .select('userId')
        .execute()
      const duplicateUserProjects = await promise(
        context.projectService.getUserProjects(user.id)
      )

      expect(res.statusCode).toEqual(409)
      expect(allAccountNames).toHaveLength(accountsBefore.length)
      expect(allAccountNames).not.toContain('Account for duplicate user')
      expect(usersAfter).toHaveLength(usersBefore.length)
      expect(projectsAfter).toHaveLength(projectsBefore.length)
      expect(membershipsAfter).toHaveLength(membershipsBefore.length)
      expect(duplicateUserProjects).toHaveLength(0)
    })
  })

  describe('Login', () => {
    it('should create a new session when logging in with valid credentials', async () => {
      const [account] = await context.harness.loadFixtures([
        fixtures.account.AccountA,
      ])

      const user = await promise(
        context.accountService.createUser(
          account.id,
          'John Smith',
          'jsmith@example.com',
          'hunter2!'
        )
      )

      const res = await context.app.inject({
        method: 'POST',
        url: '/login',
        body: {
          email: 'jsmith@example.com',
          password: 'hunter2!',
        },
      })

      const sessionToken = getSessionTokenFromResponse(
        res,
        context.harness.env.SESSION_COOKIE,
        context.harness.env.SESSION_SECRET
      )

      await expect(
        promise(context.accountService.getSessionByToken(sessionToken))
      ).resolves.toMatchObject({
        id: expect.any(String),
        sessionToken,
        subjectId: user.id,
        subjectType: 'user',
      })
    })

    it('should return not-authenticated when logging in with invalid credentials', async () => {
      const res = await attemptLogin(
        context.app,
        'imposter@example.net',
        'nothunter2'
      )

      const cookieNames = res.cookies.map(c => c.name)

      expect(cookieNames).not.toContain(context.harness.env.SESSION_COOKIE)
      expect(res.statusCode).toEqual(401)
    })
  })

  describe('Logout', () => {
    it('should revoke the current session when logging out', async () => {
      const [session] = await context.harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      await context.app.inject({
        method: 'POST',
        url: '/logout',
        cookies: {
          [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
            session.sessionToken
          ),
        },
      })

      await expect(
        promise(context.accountService.getSessionByToken(session.sessionToken))
      ).rejects.toThrow(notFound())
    })

    it('should be idempotent to attempt logging out with no active session', async () => {
      const res = await context.app.inject({
        method: 'POST',
        url: '/logout',
      })

      expect(res.statusCode).toEqual(204)
    })
  })

  describe('Current user', () => {
    it('should return the current user', async () => {
      const [user, session] = await context.harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])

      const res = await context.app.inject({
        method: 'GET',
        url: '/me',
        cookies: {
          [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
            session.sessionToken
          ),
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({ ...user })
    })

    it('should return not-authenticated for the current user with no session', async () => {
      const res = await context.app.inject({
        method: 'GET',
        url: '/me',
      })

      expect(res.statusCode).toEqual(401)
    })
  })
})
