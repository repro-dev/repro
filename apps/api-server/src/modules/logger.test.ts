import expect from 'expect'
import fastify from 'fastify'
import { Writable } from 'node:stream'
import { describe, it } from 'node:test'
import {
  createFastifyLoggerOptions,
  createRequestLogContext,
  noopLogger,
  registerRequestLoggingHooks,
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

function createLogCapture() {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      const text = chunk.toString().trim()
      if (text) lines.push(text)
      callback()
    },
  })
  return { stream, lines, getParsedLines: () => lines.map(l => JSON.parse(l)) }
}

async function waitForPendingWrites() {
  await new Promise(resolve => setImmediate(resolve))
}

describe('Logger integration', () => {
  it('produces valid JSON log lines with expected fields', async () => {
    const { stream, getParsedLines } = createLogCapture()
    const options = {
      ...createFastifyLoggerOptions({ nodeEnv: 'production' }),
      stream,
    }
    const app = fastify({ logger: options })
    registerRequestLoggingHooks(app)
    app.get('/ping', (_req, reply) => reply.send({ ok: true }))

    await app.ready()
    await app.inject({ method: 'GET', url: '/ping' })
    await waitForPendingWrites()

    const parsed = getParsedLines()
    expect(parsed.length).toBeGreaterThan(0)
    for (const entry of parsed) {
      expect(typeof entry.level).toBe('number')
      expect(typeof entry.time).toBe('number')
      expect(typeof entry.msg).toBe('string')
    }

    await app.close()
  })

  it('redacts sensitive request body fields in actual log output', async () => {
    const { stream, getParsedLines } = createLogCapture()
    const options = {
      ...createFastifyLoggerOptions({ nodeEnv: 'production' }),
      stream,
    }
    const app = fastify({ logger: options })
    app.post('/login', (req, reply) => {
      req.log.info({ req: { body: req.body } }, 'login request')
      reply.send({ ok: true })
    })

    await app.ready()
    await app.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        password: 'my-password-value',
        token: 'my-token-value',
        secret: 'my-secret-value',
        newPassword: 'new-password-value',
        sessionToken: 'session-tok',
        verificationToken: 'verify-tok',
        invitationToken: 'invite-tok',
        resetToken: 'reset-tok',
        clientSecret: 'client-secret-val',
        webhookSecret: 'webhook-secret-val',
      }),
    })
    await waitForPendingWrites()

    const parsed = getParsedLines()
    const loginLogs = parsed.filter(
      e => typeof e.msg === 'string' && e.msg.includes('login request')
    )
    expect(loginLogs.length).toBeGreaterThan(0)

    for (const entry of loginLogs) {
      const body = (entry.req as any)?.body as
        | Record<string, unknown>
        | undefined
      if (!body) continue
      expect(body.password).toBe('[Redacted]')
      expect(body.token).toBe('[Redacted]')
      expect(body.secret).toBe('[Redacted]')
      expect(body.newPassword).toBe('[Redacted]')
      expect(body.sessionToken).toBe('[Redacted]')
      expect(body.verificationToken).toBe('[Redacted]')
      expect(body.invitationToken).toBe('[Redacted]')
      expect(body.resetToken).toBe('[Redacted]')
      expect(body.clientSecret).toBe('[Redacted]')
      expect(body.webhookSecret).toBe('[Redacted]')
    }

    await app.close()
  })

  it('redacts authorization and cookie headers in log output', async () => {
    const { stream, getParsedLines } = createLogCapture()
    const options = {
      ...createFastifyLoggerOptions({ nodeEnv: 'production' }),
      stream,
    }
    const app = fastify({ logger: options })
    app.get('/test', (req, reply) => {
      req.log.info(
        {
          req: {
            headers: {
              authorization: 'Bearer real-token',
              cookie: 'session=real-session',
            },
          },
        },
        'header log'
      )
      reply.send({ ok: true })
    })

    await app.ready()
    await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        authorization: 'Bearer real-token',
        cookie: 'session=real-session',
      },
    })
    await waitForPendingWrites()

    const parsed = getParsedLines()
    const headerLogs = parsed.filter(
      e => typeof e.msg === 'string' && e.msg.includes('header log')
    )
    expect(headerLogs.length).toBeGreaterThan(0)

    for (const entry of headerLogs) {
      const headers = (entry.req as any)?.headers as
        | Record<string, unknown>
        | undefined
      if (!headers) continue
      expect(headers.authorization).toBe('[Redacted]')
      expect(headers.cookie).toBe('[Redacted]')
    }

    await app.close()
  })

  it('redacts set-cookie response header in log output', async () => {
    const { stream, getParsedLines } = createLogCapture()
    const options = {
      ...createFastifyLoggerOptions({ nodeEnv: 'production' }),
      stream,
    }
    const app = fastify({ logger: options })
    app.get('/set-cookie', (req, reply) => {
      reply.header('set-cookie', 'session=secret-value')
      req.log.info(
        { res: { headers: { 'set-cookie': 'session=secret-value' } } },
        'response log'
      )
      reply.send({ ok: true })
    })

    await app.ready()
    await app.inject({ method: 'GET', url: '/set-cookie' })
    await waitForPendingWrites()

    const parsed = getParsedLines()
    const respLogs = parsed.filter(
      e => typeof e.msg === 'string' && e.msg.includes('response log')
    )
    expect(respLogs.length).toBeGreaterThan(0)

    for (const entry of respLogs) {
      const res = entry.res as any as Record<string, unknown> | undefined
      if (!res) continue
      const headers = res.headers as Record<string, unknown> | undefined
      if (!headers) continue
      expect(headers['set-cookie']).toBe('[Redacted]')
    }

    await app.close()
  })

  it('child loggers propagate bindings', async () => {
    const { stream, getParsedLines } = createLogCapture()
    const options = {
      ...createFastifyLoggerOptions({ nodeEnv: 'production' }),
      stream,
    }
    const app = fastify({ logger: options })

    await app.ready()
    const child = app.log.child({ requestId: 'req-abc' })
    child.info('child log test')
    await waitForPendingWrites()

    const parsed = getParsedLines()
    const childLogs = parsed.filter(
      e => typeof e.msg === 'string' && e.msg.includes('child log test')
    )
    expect(childLogs.length).toBeGreaterThan(0)
    for (const entry of childLogs) {
      expect(entry.requestId).toBe('req-abc')
    }

    await app.close()
  })

  it('nested child loggers merge bindings', async () => {
    const { stream, getParsedLines } = createLogCapture()
    const options = {
      ...createFastifyLoggerOptions({ nodeEnv: 'production' }),
      stream,
    }
    const app = fastify({ logger: options })

    await app.ready()
    const child1 = app.log.child({ requestId: 'req-abc' })
    const child2 = child1.child({ userId: 'user-123' })
    child2.info('nested child log test')
    await waitForPendingWrites()

    const parsed = getParsedLines()
    const nestedLogs = parsed.filter(
      e => typeof e.msg === 'string' && e.msg.includes('nested child log test')
    )
    expect(nestedLogs.length).toBeGreaterThan(0)
    for (const entry of nestedLogs) {
      expect(entry.requestId).toBe('req-abc')
      expect(entry.userId).toBe('user-123')
    }

    await app.close()
  })

  it('produces consistent JSON fields in development mode', async () => {
    const { stream: prodStream, getParsedLines: getProdLines } =
      createLogCapture()
    const prodOptions = {
      ...createFastifyLoggerOptions({ nodeEnv: 'production' }),
      stream: prodStream,
    }
    const prodApp = fastify({ logger: prodOptions })
    registerRequestLoggingHooks(prodApp)
    prodApp.get('/test', (_req, reply) => reply.send({ ok: true }))

    await prodApp.ready()
    await prodApp.inject({ method: 'GET', url: '/test' })
    await waitForPendingWrites()

    const prodParsed = getProdLines()

    const { stream: devStream, getParsedLines: getDevLines } =
      createLogCapture()
    const devOptions = {
      ...createFastifyLoggerOptions({ nodeEnv: 'development' }),
      stream: devStream,
    }
    const devApp = fastify({ logger: devOptions })
    registerRequestLoggingHooks(devApp)
    devApp.get('/test', (_req, reply) => reply.send({ ok: true }))

    await devApp.ready()
    await devApp.inject({ method: 'GET', url: '/test' })
    await waitForPendingWrites()

    const devParsed = getDevLines()

    expect(prodParsed.length).toBeGreaterThan(0)
    expect(devParsed.length).toBeGreaterThan(0)

    // Both modes produce level, time, msg fields
    for (const entry of prodParsed) {
      expect(entry).toHaveProperty('level')
      expect(entry).toHaveProperty('time')
      expect(entry).toHaveProperty('msg')
    }
    for (const entry of devParsed) {
      expect(entry).toHaveProperty('level')
      expect(entry).toHaveProperty('time')
      expect(entry).toHaveProperty('msg')
    }

    await prodApp.close()
    await devApp.close()
  })
})
