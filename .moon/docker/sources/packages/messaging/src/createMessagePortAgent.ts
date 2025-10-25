import { fromEvent, map } from 'rxjs'
import { createAgentWith, Message } from './createAgentWith'
import { Agent } from './types'

export function createMessagePortAgent(port: MessagePort): Agent {
  return createAgentWith({
    name: 'MessagePortAgent',

    message$: fromEvent<MessageEvent<Message>>(port, 'message').pipe(
      map(event => event.data)
    ),

    dispatch(message: Message) {
      port.postMessage(message)
    },
  })
}
