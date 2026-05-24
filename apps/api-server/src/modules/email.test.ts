import expect from 'expect'
import { reject, resolve } from 'fluture'
import { describe, it } from 'node:test'
import { sendEmailInBackground } from './email'
import { ApiLogger } from './logger'

function createLoggerSpy() {
  const calls: Array<{ payload: unknown; message?: string }> = []
  const logger: ApiLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (payload, message) => {
      calls.push({ payload, message })
    },
    fatal: () => {},
    child: () => logger,
  }
  return { logger, calls }
}

function waitForBackgroundFork() {
  return new Promise(resolve => setImmediate(resolve))
}

describe('Modules > email', () => {
  it('logs structured context when background email send fails', async () => {
    const { logger, calls } = createLoggerSpy()
    const error = new Error('provider unavailable')

    sendEmailInBackground(
      {
        to: 'person@example.com',
        from: 'hello@repro.dev',
        subject: 'Secret subject',
        text: 'Secret body',
        html: '<p>Secret body</p>',
      },
      () => reject(error),
      {
        logger,
        emailKind: 'invitation',
        context: {
          requestId: 'req-123',
          accountId: 'acct-123',
          invitationId: 'inv-123',
        },
      }
    )

    await waitForBackgroundFork()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      payload: {
        err: error,
        event: 'transactional_email.send_failed',
        emailKind: 'invitation',
        requestId: 'req-123',
        accountId: 'acct-123',
        invitationId: 'inv-123',
      },
      message: 'Transactional email send failed',
    })
    expect(JSON.stringify(calls[0])).not.toContain('person@example.com')
    expect(JSON.stringify(calls[0])).not.toContain('Secret body')
  })

  it('does not log successful background sends', async () => {
    const { logger, calls } = createLoggerSpy()

    sendEmailInBackground(
      {
        to: 'person@example.com',
        from: 'hello@repro.dev',
        subject: 'Hi',
        html: '<p>Hi</p>',
      },
      () => resolve(undefined),
      { logger, emailKind: 'verification' }
    )

    await waitForBackgroundFork()

    expect(calls).toHaveLength(0)
  })

  it('keeps omitted logger local-safe when background send fails', async () => {
    sendEmailInBackground(
      {
        to: 'person@example.com',
        from: 'hello@repro.dev',
        subject: 'Hi',
        html: '<p>Hi</p>',
      },
      () => reject(new Error('provider unavailable'))
    )

    await waitForBackgroundFork()
  })
})
