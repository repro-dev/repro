import { FutureInstance } from 'fluture'

export interface SendParams {
  to: string
  from: string
  subject: string
  template: string
  params: Record<string, string>
}

export interface EmailUtils {
  send(params: SendParams): FutureInstance<Error, void>
  getAddress(key: string): string
}
