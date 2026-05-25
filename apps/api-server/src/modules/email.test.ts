import expect from 'expect'
import { reject, resolve } from 'fluture'
import { describe, it } from 'node:test'
import { createEmailModule } from './email'
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

    const emailModule = createEmailModule({
      logger,
      sendEmail: () => reject(error),
    })

    emailModule.sendEmailInBackground(
      {
        to: 'person@example.com',
        from: 'hello@repro.dev',
        subject: 'Secret subject',
        text: 'Secret body',
        html: '<p>Secret body</p>',
      },
      {
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

    const emailModule = createEmailModule({
      logger,
      sendEmail: () => resolve(undefined),
    })

    emailModule.sendEmailInBackground(
      {
        to: 'person@example.com',
        from: 'hello@repro.dev',
        subject: 'Hi',
        html: '<p>Hi</p>',
      },
      { emailKind: 'verification' }
    )

    await waitForBackgroundFork()

    expect(calls).toHaveLength(0)
  })

  it('keeps omitted logger local-safe when background send fails', async () => {
    const emailModule = createEmailModule({
      sendEmail: () => reject(new Error('provider unavailable')),
    })

    emailModule.sendEmailInBackground({
      to: 'person@example.com',
      from: 'hello@repro.dev',
      subject: 'Hi',
      html: '<p>Hi</p>',
    })

    await waitForBackgroundFork()
  })
})
