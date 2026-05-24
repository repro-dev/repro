import {
  EmailMessage,
  createEmailProvider,
  type EmailProvider,
} from '@repro/email'
import { FutureInstance } from 'fluture'
import { defaultEnv as env } from '~/config/env'

function createEmailProviderTransport(provider: EmailProvider) {
  return (message: EmailMessage): FutureInstance<Error, void> =>
    provider.send(message)
}

const emailProvider = createEmailProvider(env.RESEND_API_KEY)

export const emailFromAddress = env.EMAIL_FROM_ADDRESS
export const sendEmail = createEmailProviderTransport(emailProvider)
