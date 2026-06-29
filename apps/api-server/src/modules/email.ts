import {
  EmailMessage,
  createEmailProvider,
  type EmailProvider,
} from '@repro/email'
import { FutureInstance } from 'fluture'
import { defaultEnv as env } from '~/config/env'
import { ApiLogger } from './logger'

function createEmailProviderTransport(provider: EmailProvider) {
  return (message: EmailMessage): FutureInstance<Error, void> =>
    provider.send(message)
}

const emailProvider = createEmailProvider(env.RESEND_API_KEY)

export type SendEmail = (message: EmailMessage) => FutureInstance<Error, void>

export type EmailModule = {
  emailFromAddress: string
  sendEmail: SendEmail
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

  return {
    emailFromAddress: env.EMAIL_FROM_ADDRESS,
    sendEmail,
  }
}

const defaultEmailModule = createEmailModule()

export const emailFromAddress = defaultEmailModule.emailFromAddress
export const sendEmail = defaultEmailModule.sendEmail
