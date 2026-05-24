import {
  EmailMessage,
  createEmailProvider,
  type EmailProvider,
} from '@repro/email'
import { FutureInstance, fork } from 'fluture'
import { defaultEnv as env } from '~/config/env'
import { ApiLogger, noopLogger } from './logger'

function createEmailProviderTransport(provider: EmailProvider) {
  return (message: EmailMessage): FutureInstance<Error, void> =>
    provider.send(message)
}

const emailProvider = createEmailProvider(env.RESEND_API_KEY)

export const emailFromAddress = env.EMAIL_FROM_ADDRESS
export const sendEmail = createEmailProviderTransport(emailProvider)

export type SendEmail = (message: EmailMessage) => FutureInstance<Error, void>

export type SendEmailInBackgroundOptions = {
  logger?: ApiLogger
  emailKind?: string
  context?: Record<string, unknown>
}

export function sendEmailInBackground(
  message: EmailMessage,
  send: SendEmail = sendEmail,
  options: SendEmailInBackgroundOptions = {}
): void {
  const logger = options.logger ?? noopLogger

  send(message).pipe(
    fork(error => {
      logger.error(
        {
          err: error,
          event: 'transactional_email.send_failed',
          ...(options.emailKind ? { emailKind: options.emailKind } : {}),
          ...options.context,
        },
        'Transactional email send failed'
      )
    })(() => {})
  )
}
