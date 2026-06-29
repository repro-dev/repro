import expect from 'expect'
import { resolve } from 'fluture'
import { describe, it } from 'node:test'
import { createEmailModule } from './email'

describe('Modules > email', () => {
  it('creates an email module with sendEmail and emailFromAddress', () => {
    const emailModule = createEmailModule({
      sendEmail: () => resolve(undefined),
    })

    expect(emailModule.emailFromAddress).toEqual('noreply@repro.dev')
    expect(typeof emailModule.sendEmail).toEqual('function')
  })
})
