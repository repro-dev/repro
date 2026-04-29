import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { fixtures } from '~/testing'
import { notFound } from '~/utils/errors'
import {
  AccountTestContext,
  createAccountTestContext,
} from './account.test-utils'

describe('Routers > Account > Password reset', () => {
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

  it('should accept a valid email and return 204', async () => {
    const [account] = await context.harness.loadFixtures([
      fixtures.account.AccountA,
    ])

    await promise(
      context.accountService.createUser(
        account.id,
        'John Smith',
        'jsmith@example.com',
        'hunter2!'
      )
    )

    const res = await context.app.inject({
      method: 'POST',
      url: '/reset-password',
      body: { email: 'jsmith@example.com' },
    })

    expect(res.statusCode).toEqual(204)
  })

  it('should return 204 even when the email does not exist (prevent enumeration)', async () => {
    const res = await context.app.inject({
      method: 'POST',
      url: '/reset-password',
      body: { email: 'nobody@example.com' },
    })

    expect(res.statusCode).toEqual(204)
  })

  it('should confirm a valid token and update the password', async () => {
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

    const token = await promise(
      context.accountService.createPasswordResetToken(user.id)
    )

    const res = await context.app.inject({
      method: 'POST',
      url: '/reset-password/confirm',
      body: { token, newPassword: 'newHunter99!' },
    })

    expect(res.statusCode).toEqual(204)

    // Should now be able to log in with new password
    const loginRes = await context.app.inject({
      method: 'POST',
      url: '/login',
      body: { email: 'jsmith@example.com', password: 'newHunter99!' },
    })

    expect(loginRes.statusCode).toEqual(200)
  })

  it('should return 404 for a confirm request with an invalid token', async () => {
    const res = await context.app.inject({
      method: 'POST',
      url: '/reset-password/confirm',
      body: { token: 'invalid-token', newPassword: 'newHunter99!' },
    })

    expect(res.statusCode).toEqual(404)
  })

  it('should return 404 when reusing a token', async () => {
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

    const token = await promise(
      context.accountService.createPasswordResetToken(user.id)
    )

    // First use — succeeds
    await context.app.inject({
      method: 'POST',
      url: '/reset-password/confirm',
      body: { token, newPassword: 'newHunter99!' },
    })

    // Second use — rejected
    const res = await context.app.inject({
      method: 'POST',
      url: '/reset-password/confirm',
      body: { token, newPassword: 'anotherPassword1!' },
    })

    expect(res.statusCode).toEqual(404)
  })

  it('should reject a new password shorter than 8 characters', async () => {
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

    const token = await promise(
      context.accountService.createPasswordResetToken(user.id)
    )

    const res = await context.app.inject({
      method: 'POST',
      url: '/reset-password/confirm',
      body: { token, newPassword: 'short' },
    })

    expect(res.statusCode).toEqual(400)
  })

  it('should invalidate existing sessions after password reset', async () => {
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

    const session = await promise(
      context.accountService.createSession(user.id, 'user')
    )

    const token = await promise(
      context.accountService.createPasswordResetToken(user.id)
    )

    await context.app.inject({
      method: 'POST',
      url: '/reset-password/confirm',
      body: { token, newPassword: 'newHunter99!' },
    })

    await expect(
      promise(context.accountService.getSessionByToken(session.sessionToken))
    ).rejects.toThrow(notFound())
  })
})
