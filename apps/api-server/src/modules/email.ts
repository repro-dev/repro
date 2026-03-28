import { EmailMessage, EmailProvider, createEmailProvider } from '@repro/email'
import { FutureInstance } from 'fluture'
import { defaultEnv as env } from '~/config/env'

// Instantiate the email provider once at module load time.
// Uses the Resend adapter when RESEND_API_KEY is set; falls back to
// the console provider in local dev (no real sending).
export const emailProvider: EmailProvider = createEmailProvider(
  env.RESEND_API_KEY
)

export function sendEmail(message: EmailMessage): FutureInstance<Error, void> {
  return emailProvider.send(message)
}
