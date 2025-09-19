import { SyntheticId } from '@repro/domain'
import { logger } from '@repro/logger'
import { randomString } from '@repro/random-string'
import Future, { fork, FutureInstance } from 'fluture'
import { filter, fromEvent, map } from 'rxjs'
import { Agent, Intent, Resolver, Unsubscribe } from './types'

function createCorrelationId(): SyntheticId {
  return randomString(5)
}

interface IntentMessage {
  type: 'intent'
  correlationId: SyntheticId
  intent: Intent<any>
}

interface ResponseMessage {
  type: 'response'
  correlationId: SyntheticId
  response: any
}

interface ErrorMessage {
  type: 'error'
  correlationId: SyntheticId
  error: any
}

type Message = IntentMessage | ResponseMessage | ErrorMessage

function isIntentMessage(message: Message): message is IntentMessage {
  return message.type === 'intent'
}

function isResponseMessage(message: Message): message is ResponseMessage {
  return message.type === 'response'
}

function isErrorMessage(message: Message): message is ErrorMessage {
  return message.type === 'error'
}

const EVENT_NAME = 'repro-ptp-message'

export function createPTPAgent(): Agent {
  const callbacks = new Map<
    SyntheticId,
    {
      resolve: (value: any) => void
      reject: (error: Error) => void
    }
  >()

  const resolvers = new Map<SyntheticId, Resolver>()

  const message$ = fromEvent<Message>(window, EVENT_NAME).pipe(
    map(event => (event as CustomEvent<Message>).detail)
  )

  const intentMessage$ = message$.pipe(filter(isIntentMessage))
  const responseMessage$ = message$.pipe(filter(isResponseMessage))
  const errorMessage$ = message$.pipe(filter(isErrorMessage))

  intentMessage$.subscribe(message => {
    const { correlationId, intent } = message
    const resolver = resolvers.get(intent.type)

    function dispatchError(error: any) {
      dispatch({
        type: 'error',
        correlationId,
        error,
      })
    }

    function dispatchResponse(response: any) {
      dispatch({
        type: 'response',
        correlationId,
        response,
      })
    }

    if (resolver) {
      fork(dispatchError)(dispatchResponse)(resolver(intent.payload))
    }
  })

  responseMessage$.subscribe(message => {
    const { correlationId, response } = message
    const callback = callbacks.get(correlationId)

    if (callback) {
      callback.resolve(response)
      callbacks.delete(correlationId)
    }
  })

  errorMessage$.subscribe(message => {
    const { correlationId, error } = message
    const callback = callbacks.get(correlationId)

    if (callback) {
      callback.reject(error)
      callbacks.delete(correlationId)
    }
  })

  function dispatch(message: Message) {
    const event = new window.CustomEvent(EVENT_NAME, {
      detail: message,
    })

    if (event.detail == null) {
      logger.error('PTP Agent: unable to serialize message.', message)
      return
    }

    window.dispatchEvent(event)

    logger.debug('(PTPAgent -> dispatch):', message)
  }

  function raiseIntent<R, P = any>(
    intent: Intent<P>
  ): FutureInstance<Error, R> {
    return Future((reject, resolve) => {
      const correlationId = createCorrelationId()

      callbacks.set(correlationId, {
        resolve,
        reject,
      })

      dispatch({
        type: 'intent',
        correlationId,
        intent,
      })

      return () => {
        console.warn('Intent is not cancellable', intent)
      }
    })
  }

  function subscribeToIntent(type: string, resolver: Resolver): Unsubscribe {
    resolvers.set(type, resolver)

    return () => {
      resolvers.delete(type)
    }
  }

  function subscribeToIntentAndForward(
    type: string,
    forwardAgent: Agent
  ): Unsubscribe {
    return subscribeToIntent(type, payload => {
      return forwardAgent.raiseIntent({ type, payload })
    })
  }

  return {
    name: 'PTPAgent',
    raiseIntent,
    subscribeToIntent,
    subscribeToIntentAndForward,
  }
}
