import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { decodeId } from '~/modules/database'
import { fixtures } from '~/testing'
import {
  AccountTestContext,
  createAccountTestContext,
} from './account.test-utils'

describe('Routers > Account > Verification', () => {
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

  it('should mark a user as unverified on registration', async () => {
    const res = await context.app.inject({
      method: 'POST',
      url: '/register',
      body: {
        accountName: 'New Account',
        userName: 'John Smith',
        email: 'jsmith@example.com',
        password: 'hunter2!',
      },
    })

    expect(res.json()).toMatchObject({
      user: {
        id: expect.any(String),
        name: 'John Smith',
        verified: false,
      },
    })

    // Assert an email.send job was enqueued
    const jobs = await context.harness.getEnqueuedEmailJobs()
    expect(jobs).toHaveLength(1)

    // Drain the outbox so the email is actually sent
    await context.harness.drainOutbox()

    const [message] = context.harness.getSentEmails()
    expect(context.harness.getSentEmails()).toHaveLength(1)
    expect(message).toMatchObject({
      to: 'jsmith@example.com',
      from: 'noreply@repro.dev',
      subject: 'Verify your Repro email address',
    })
    expect(message?.html).toContain('/account/verify')
  })

  it('should return not-authenticated when verifying without an active session', async () => {
    const [user] = await context.harness.loadFixtures([fixtures.account.UserA])

    const verificationToken = await context.harness.db
      .selectFrom('users')
      .select('verificationToken')
      .where('id', '=', decodeId(user.id))
      .executeTakeFirstOrThrow()
      .then(row => row.verificationToken)

    const res = await context.app.inject({
      method: 'POST',
      url: '/verify',
      body: {
        verificationToken,
        email: 'user-a@example.com',
      },
    })

    expect(res.statusCode).toEqual(401)

    await expect(
      promise(context.accountService.getUserById(user.id))
    ).resolves.toMatchObject({ verified: false })
  })

  it('should verify a user', async () => {
    const [user, session] = await context.harness.loadFixtures([
      fixtures.account.UserA,
      fixtures.account.UserA_Session,
    ])

    const verificationToken = await context.harness.db
      .selectFrom('users')
      .select('verificationToken')
      .where('id', '=', decodeId(user.id))
      .executeTakeFirstOrThrow()
      .then(row => row.verificationToken)

    const res = await context.app.inject({
      method: 'POST',
      url: '/verify',
      body: {
        verificationToken,
        email: 'user-a@example.com',
      },
      cookies: {
        [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
          session.sessionToken
        ),
      },
    })

    expect(res.statusCode).toEqual(204)

    expect(
      promise(context.accountService.getUserById(user.id))
    ).resolves.toMatchObject({
      verified: true,
    })
  })

  it('should not be possible to verify another user', async () => {
    const [session, user] = await context.harness.loadFixtures([
      fixtures.account.UserA_Session,
      fixtures.account.UserB,
    ])

    const verificationToken = await context.harness.db
      .selectFrom('users')
      .select('verificationToken')
      .where('id', '=', decodeId(user.id))
      .executeTakeFirstOrThrow()
      .then(row => row.verificationToken)

    const res = await context.app.inject({
      method: 'POST',
      url: '/verify',
      body: {
        verificationToken,
        email: 'user-b@example.com',
      },
      cookies: {
        [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
          session.sessionToken
        ),
      },
    })

    expect(res.statusCode).toEqual(403)

    await expect(
      promise(context.accountService.getUserById(user.id))
    ).resolves.not.toMatchObject({ verified: true })
  })

  it('should reject an empty verification token at the schema boundary', async () => {
    const [user, session] = await context.harness.loadFixtures([
      fixtures.account.UserA,
      fixtures.account.UserA_Session,
    ])

    const res = await context.app.inject({
      method: 'POST',
      url: '/verify',
      body: {
        verificationToken: '',
        email: 'user-a@example.com',
      },
      cookies: {
        [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
          session.sessionToken
        ),
      },
    })

    expect(res.statusCode).toEqual(400)

    await expect(
      promise(context.accountService.getUserById(user.id))
    ).resolves.toMatchObject({
      verified: false,
    })
  })
})
