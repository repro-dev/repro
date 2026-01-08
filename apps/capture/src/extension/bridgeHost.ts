import { logger } from '@repro/logger'
import { createMessagingAgent } from '@repro/messaging'
import { fork } from 'fluture'
import { createIframe } from './iframe'

function main() {
  createMessagingAgent({ name: 'bridgeHost' })
  createIframe(`${process.env.REPRO_APP_URL}/apiBridge.html`).pipe(
    fork(error => logger.error(error))(() => {})
  )
}

main()
