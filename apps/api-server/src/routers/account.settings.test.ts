import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import {
  AccountTestContext,
  createAccountTestContext,
} from './account.test-utils'

describe('Routers > Account > Account settings', () => {
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

  async function createAdminSession() {
    const account = await promise(
      context.accountService.createAccount('Admin Account')
    )
    const adminUser = await promise(
      context.accountService.createUser(
        account.id,
        'Admin User',
        'admin@example.com',
        'hunter2!'
      )
    )
    await promise(
      context.accountService.createUser(
        account.id,
        'Member User',
        'member@example.com',
        'hunter2!'
      )
    )
    await promise(context.accountService.setUserIsAdmin(adminUser.id, true))
    await promise(
      context.harness.services.projectService.createProject(
        account.id,
        'Active Project'
      )
    )

    const session = await promise(
      context.accountService.createSession(adminUser.id, 'user')
    )

    return { account, session }
  }

  describe('GET /account/settings', () => {
    it('should return account summary for an admin user', async () => {
      const { account, session } = await createAdminSession()

      const res = await context.app.inject({
        method: 'GET',
        url: '/account/settings',
        cookies: {
          [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
            session.sessionToken
          ),
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toMatchObject({
        id: account.id,
        name: 'Admin Account',
        createdAt: expect.any(String),
        userCount: 2,
        projectCount: 1,
      })
    })

    it('should return 403 for a non-admin user', async () => {
      const account = await promise(
        context.accountService.createAccount('Member Account')
      )
      const memberUser = await promise(
        context.accountService.createUser(
          account.id,
          'Member User',
          'member@example.com',
          'hunter2!'
        )
      )
      const session = await promise(
        context.accountService.createSession(memberUser.id, 'user')
      )

      const res = await context.app.inject({
        method: 'GET',
        url: '/account/settings',
        cookies: {
          [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
            session.sessionToken
          ),
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should return 401 without session', async () => {
      const res = await context.app.inject({
        method: 'GET',
        url: '/account/settings',
      })

      expect(res.statusCode).toEqual(401)
    })
  })

  describe('PUT /account/name', () => {
    it('should rename the account for an admin user', async () => {
      const { account, session } = await createAdminSession()

      const res = await context.app.inject({
        method: 'PUT',
        url: '/account/name',
        body: { name: 'Renamed Account' },
        cookies: {
          [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
            session.sessionToken
          ),
        },
      })

      expect(res.statusCode).toEqual(204)

      const updatedAccount = await promise(
        context.accountService.getAccountById(account.id)
      )
      expect(updatedAccount.name).toEqual('Renamed Account')
    })

    it('should return 400 for an empty account name', async () => {
      const { session } = await createAdminSession()

      const res = await context.app.inject({
        method: 'PUT',
        url: '/account/name',
        body: { name: '' },
        cookies: {
          [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
            session.sessionToken
          ),
        },
      })

      expect(res.statusCode).toEqual(400)
    })

    it('should return 403 for a non-admin user', async () => {
      const account = await promise(
        context.accountService.createAccount('Member Account')
      )
      const memberUser = await promise(
        context.accountService.createUser(
          account.id,
          'Member User',
          'member@example.com',
          'hunter2!'
        )
      )
      const session = await promise(
        context.accountService.createSession(memberUser.id, 'user')
      )

      const res = await context.app.inject({
        method: 'PUT',
        url: '/account/name',
        body: { name: 'Renamed Account' },
        cookies: {
          [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
            session.sessionToken
          ),
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should return 401 without session', async () => {
      const res = await context.app.inject({
        method: 'PUT',
        url: '/account/name',
        body: { name: 'Renamed Account' },
      })

      expect(res.statusCode).toEqual(401)
    })
  })
})
