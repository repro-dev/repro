import {
  createEmailProvider,
  emailVerificationEmail,
  invitationEmail,
  passwordResetEmail,
  type EmailProvider,
} from '@repro/email'
import { FutureInstance } from 'fluture'
import { defaultEnv as env } from '~/config/env'

export interface TransactionalEmailService {
  sendVerificationEmail(params: {
    email: string
    userName?: string
    verificationToken: string
  }): FutureInstance<Error, void>
  sendPasswordResetEmail(params: {
    email: string
    userName?: string
    resetToken: string
  }): FutureInstance<Error, void>
  sendInvitationEmail(params: {
    email: string
    inviterName?: string
    invitationToken: string
    workspaceName: string
  }): FutureInstance<Error, void>
}

function createVerificationUrl(
  baseUrl: string,
  email: string,
  verificationToken: string
) {
  const url = new URL('/account/verify', baseUrl)
  url.searchParams.set('verificationToken', verificationToken)
  url.searchParams.set('email', email)
  return url.toString()
}

function createPasswordResetUrl(baseUrl: string, resetToken: string) {
  return new URL(`/account/reset-password/${resetToken}`, baseUrl).toString()
}

function createInvitationUrl(
  baseUrl: string,
  email: string,
  invitationToken: string
) {
  const url = new URL('/account/accept-invitation', baseUrl)
  url.searchParams.set('invitationToken', invitationToken)
  url.searchParams.set('email', email)
  return url.toString()
}

function createTransactionalEmailService(
  provider: EmailProvider,
  baseUrl = env.REPRO_APP_URL,
  fromAddress = env.EMAIL_FROM_ADDRESS
): TransactionalEmailService {
  return {
    sendVerificationEmail({ email, userName, verificationToken }) {
      return provider.send({
        to: email,
        from: fromAddress,
        ...emailVerificationEmail({
          verificationUrl: createVerificationUrl(
            baseUrl,
            email,
            verificationToken
          ),
          userName,
        }),
      })
    },
    sendPasswordResetEmail({ email, userName, resetToken }) {
      return provider.send({
        to: email,
        from: fromAddress,
        ...passwordResetEmail({
          resetUrl: createPasswordResetUrl(baseUrl, resetToken),
          userName,
        }),
      })
    },
    sendInvitationEmail({
      email,
      inviterName,
      invitationToken,
      workspaceName,
    }) {
      return provider.send({
        to: email,
        from: fromAddress,
        ...invitationEmail({
          invitationUrl: createInvitationUrl(baseUrl, email, invitationToken),
          workspaceName,
          inviterName,
        }),
      })
    },
  }
}

export const emailProvider = createEmailProvider(env.RESEND_API_KEY)

export const transactionalEmailService = createTransactionalEmailService(
  emailProvider,
  env.REPRO_APP_URL,
  env.EMAIL_FROM_ADDRESS
)

export { createTransactionalEmailService }
