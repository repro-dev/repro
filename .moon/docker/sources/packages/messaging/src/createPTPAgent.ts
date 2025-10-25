import { logger } from '@repro/logger'
import { fromEvent, map } from 'rxjs'
import { createAgentWith, Message } from './createAgentWith'
import { Agent } from './types'

const EVENT_NAME = 'repro-ptp-message'

export function createPTPAgent(): Agent {
  return createAgentWith({
    name: 'PTPAgent',

    message$: fromEvent(window, EVENT_NAME).pipe(
      map(event => (event as CustomEvent<Message>).detail)
    ),

    dispatch(message: Message) {
      const event = new window.CustomEvent(EVENT_NAME, {
        detail: message,
      })

      if (event.detail == null) {
        logger.error('PTP Agent: unable to serialize message.', message)
        return
      }

      window.dispatchEvent(event)
    },
  })
}
