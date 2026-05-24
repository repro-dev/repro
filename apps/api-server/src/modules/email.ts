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

export type SendEmail = (message: EmailMessage) => FutureInstance<Error, void>

export type SendEmailInBackgroundOptions = {
  emailKind?: string
  context?: Record<string, unknown>
}

export type EmailModule = {
  emailFromAddress: string
  sendEmail: SendEmail
  sendEmailInBackground: (
    message: EmailMessage,
    options?: SendEmailInBackgroundOptions
  ) => void
}

export type CreateEmailModuleOptions = {
  provider?: EmailProvider
  sendEmail?: SendEmail
  logger?: ApiLogger
}

export function createEmailModule(
  options: CreateEmailModuleOptions = {}
): EmailModule {
  const sendEmail =
    options.sendEmail ??
    createEmailProviderTransport(options.provider ?? emailProvider)
  const logger = options.logger ?? noopLogger

  return {
    emailFromAddress: env.EMAIL_FROM_ADDRESS,
    sendEmail,
    sendEmailInBackground(message, backgroundOptions = {}) {
      sendEmail(message).pipe(
        fork(error => {
          logger.error(
            {
              err: error,
              event: 'transactional_email.send_failed',
              ...(backgroundOptions.emailKind
                ? { emailKind: backgroundOptions.emailKind }
                : {}),
              ...backgroundOptions.context,
            },
            'Transactional email send failed'
          )
        })(() => {})
      )
    },
  }
}

const defaultEmailModule = createEmailModule()

export const emailFromAddress = defaultEmailModule.emailFromAddress
export const sendEmail = defaultEmailModule.sendEmail
export const sendEmailInBackground = defaultEmailModule.sendEmailInBackground
