import expect from 'expect'
import fastify from 'fastify'
import { describe, it } from 'node:test'
import {
  createFastifyLoggerOptions,
  createRequestLogContext,
  noopLogger,
} from './logger'

describe('Modules > logger', () => {
  it('creates JSON logger options with sensitive request fields redacted', () => {
    const options = createFastifyLoggerOptions({ nodeEnv: 'production' })

    expect(options).toMatchObject({
      level: 'info',
      redact: expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.token',
        'req.body.verificationToken',
        'req.body.invitationToken',
        'req.body.resetToken',
        'req.body.secret',
        'res.headers["set-cookie"]',
      ]),
    })
  })

  it('derives test-mode logger silence from validated config input', () => {
    const options = createFastifyLoggerOptions({ nodeEnv: 'test' })

    expect(options.level).toEqual('silent')
  })

  it('creates development logger options Fastify can construct with', async () => {
    const options = createFastifyLoggerOptions({ nodeEnv: 'development' })

    const app = fastify({ logger: options })
    await app.close()
  })

  it('extracts safe request correlation metadata without unsafe fields', () => {
    const context = createRequestLogContext({
      id: 'req-123',
      method: 'POST',
      routeOptions: { url: '/account/invite' },
      url: '/account/invite?token=secret',
      headers: {
        authorization: 'Bearer secret',
        cookie: 'session=secret',
      },
      session: {
        subjectId: 'user-session-id',
        subjectType: 'user',
      },
      user: {
        type: 'user',
        id: 'user-id',
        email: 'person@example.com',
      },
    })

    expect(context).toEqual({
      requestId: 'req-123',
      method: 'POST',
      route: '/account/invite',
      sessionSubjectType: 'user',
      sessionSubjectId: 'user-session-id',
      userId: 'user-id',
    })
    expect(JSON.stringify(context)).not.toContain('person@example.com')
    expect(JSON.stringify(context)).not.toContain('secret')
  })

  it('supports child no-op loggers for local-safe defaults', () => {
    expect(noopLogger.child({ requestId: 'req-123' })).toBe(noopLogger)
    expect(() =>
      noopLogger.error({ err: new Error('boom') }, 'ignored')
    ).not.toThrow()
  })
})
