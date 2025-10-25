import { FutureInstance, go } from 'fluture'
import { EmailUtils, SendParams } from './types'

export function createStubEmailUtils(log: Array<SendParams>): EmailUtils {
  function send(params: SendParams): FutureInstance<Error, void> {
    return go(function* () {
      log.push(params)
    })
  }

  function getAddress(key: string): string {
    return key
  }

  return {
    send,
    getAddress,
  }
}
