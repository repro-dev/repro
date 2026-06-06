import { FutureInstance, resolve } from 'fluture'
import { EmailMessage, EmailProvider } from '../types'

export function createConsoleProvider(): EmailProvider {
  function send(message: EmailMessage): FutureInstance<Error, void> {
    console.log('[email:console] Sending email:', {
      to: message.to,
      from: message.from,
      subject: message.subject,
    })
    return resolve(undefined)
  }

  return { send }
}
