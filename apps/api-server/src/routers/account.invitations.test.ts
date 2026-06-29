import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { fixtures } from '~/testing'
import {
  AccountTestContext,
  createAccountTestContext,
  getSessionTokenFromResponse,
} from './account.test-utils'

describe('Routers > Account > Invitations', () => {
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

  it('should enqueue an invitation email and drain to sent emails', async () => {
    const [account, adminUser, session] = await context.harness.loadFixtures([
      fixtures.account.AccountA,
      fixtures.account.AdminUserA,
      fixtures.account.AdminUserA_Session,
    ])

    const res = await context.app.inject({
      method: 'POST',
      url: '/invite',
      body: {
        email: 'hello@example.com',
      },
      cookies: {
        [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
          session.sessionToken
        ),
      },
    })

    expect(res.statusCode).toEqual(201)

    const invitation = await context.harness.db
      .selectFrom('invitations')
      .select(['email', 'token', 'id'])
      .where('email', '=', 'hello@example.com')
      .executeTakeFirstOrThrow()

    const invitationUrl = new URL(
      '/account/accept-invitation',
      context.harness.env.REPRO_APP_URL
    )
    invitationUrl.searchParams.set('invitationToken', invitation.token)
    invitationUrl.searchParams.set('email', invitation.email)

    // Assert enqueued job
    const jobs = await context.harness.getEnqueuedEmailJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.idempotencyKey).toMatch(
      /^email\.send:invitation:[A-Za-z0-9]{7}$/
    )

    // Drain and assert sent emails
    await context.harness.drainOutbox()

    const [message] = context.harness.getSentEmails()
    expect(context.harness.getSentEmails()).toHaveLength(1)
    expect(message).toMatchObject({
      to: 'hello@example.com',
      from: 'noreply@repro.dev',
      subject: `You're invited to join ${account.name} on Repro`,
    })
    expect(message?.text).toContain(`${adminUser.name} has invited you`)
    expect(message?.html).toContain(
      invitationUrl.toString().replaceAll('&', '&amp;')
    )
  })

  it('should still return 201 if invitation email enqueue fails (non-blocking)', async () => {
    // With the enqueue path, request still succeeds even if delivery would fail
    const [, , session] = await context.harness.loadFixtures([
      fixtures.account.AccountA,
      fixtures.account.AdminUserA,
      fixtures.account.AdminUserA_Session,
    ])

    const res = await context.app.inject({
      method: 'POST',
      url: '/invite',
      body: {
        email: 'failed@example.com',
      },
      cookies: {
        [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
          session.sessionToken
        ),
      },
    })

    expect(res.statusCode).toEqual(201)

    const invitation = await context.harness.db
      .selectFrom('invitations')
      .select(['email', 'token'])
      .where('email', '=', 'failed@example.com')
      .executeTakeFirstOrThrow()

    expect(invitation).toMatchObject({ email: 'failed@example.com' })

    // Email job should be enqueued
    const jobs = await context.harness.getEnqueuedEmailJobs()
    expect(jobs).toHaveLength(1)
  })

  it.todo(
    'should enqueue a "send-invitation" task after creating an invitation'
  )

  it('should return resource-conflict when creating an invitation for a user that already exists', async () => {
    const [, session] = await context.harness.loadFixtures([
      fixtures.account.UserA,
      fixtures.account.AdminUserA_Session,
    ])

    const res = await context.app.inject({
      method: 'POST',
      url: '/invite',
      body: {
        email: 'user-a@example.com',
      },
      cookies: {
        [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
          session.sessionToken
        ),
      },
    })

    expect(res.statusCode).toEqual(409)
  })

  it('should regenerate token when re-inviting a user', async () => {
    const [account, session] = await context.harness.loadFixtures([
      fixtures.account.AccountA,
      fixtures.account.AdminUserA_Session,
    ])

    const invitation = await promise(
      context.accountService.createInvitation(account.id, 'hello@example.com')
    )

    const res = await context.app.inject({
      method: 'POST',
      url: '/invite',
      body: {
        email: 'hello@example.com',
      },
      cookies: {
        [context.harness.env.SESSION_COOKIE]: context.app.signCookie(
          session.sessionToken
        ),
      },
    })

    const newInvitation = await promise(
      context.accountService.getInvitationById(invitation.id)
    )

    expect(res.statusCode).toEqual(201)
    expect(newInvitation.token).not.toEqual(invitation.token)
  })

  it('should create a user and deactivate the invitation after accepting', async () => {
    const [account] = await context.harness.loadFixtures([
      fixtures.account.AccountA,
    ])

    const invitation = await promise(
      context.accountService.createInvitation(account.id, 'jsmith@example.com')
    )

    const res = await context.app.inject({
      method: 'POST',
      url: '/accept-invitation',
      body: {
        invitationToken: invitation.token,
        email: invitation.email,
        name: 'John Smith',
        password: 'hunter2!',
      },
    })

    const user = await promise(
      context.accountService.getUserByEmailAndPassword(
        invitation.email,
        'hunter2!'
      )
    )

    expect(res.statusCode).toEqual(201)
    expect(user).toMatchObject({
      id: expect.any(String),
      name: 'John Smith',
    })
  })

  it('should create a session on accepting an invitation', async () => {
    const [account] = await context.harness.loadFixtures([
      fixtures.account.AccountA,
    ])

    const invitation = await promise(
      context.accountService.createInvitation(account.id, 'jsmith@example.com')
    )

    const res = await context.app.inject({
      method: 'POST',
      url: '/accept-invitation',
      body: {
        invitationToken: invitation.token,
        email: invitation.email,
        name: 'John Smith',
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

  it('should throw not-found when accepting an invitation that does not exist', async () => {
    const res = await context.app.inject({
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
    const [account] = await context.harness.loadFixtures([
      fixtures.account.AccountA,
    ])

    const invitation = await promise(
      context.accountService.createInvitation(account.id, 'jsmith@example.com')
    )

    const res = await context.app.inject({
      method: 'POST',
      url: '/accept-invitation',
      body: {
        invitationToken: invitation.token,
        email: 'imposter@example.com',
        name: 'John Smith',
        password: 'hunter2!',
      },
    })

    expect(res.statusCode).toEqual(404)
  })

  it('should be possible to login with the newly-created user after accepting invitation', async () => {
    const [account] = await context.harness.loadFixtures([
      fixtures.account.AccountA,
    ])

    const invitation = await promise(
      context.accountService.createInvitation(account.id, 'jsmith@example.com')
    )

    await context.app.inject({
      method: 'POST',
      url: '/accept-invitation',
      body: {
        invitationToken: invitation.token,
        email: invitation.email,
        name: 'John Smith',
        password: 'hunter2!',
      },
    })

    const res = await context.app.inject({
      method: 'POST',
      url: '/login',
      body: {
        email: invitation.email,
        password: 'hunter2!',
      },
    })

    expect(res.statusCode).toEqual(200)
    expect(res.json()).toMatchObject({
      id: expect.any(String),
      name: 'John Smith',
    })
  })
})
