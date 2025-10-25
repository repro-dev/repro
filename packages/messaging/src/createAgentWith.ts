import { SyntheticId } from '@repro/domain'
import { logger } from '@repro/logger'
import { randomString } from '@repro/random-string'
import Future, { fork, FutureInstance } from 'fluture'
import { filter, Observable, Subscription } from 'rxjs'
import { Agent, Intent, Resolver, Unsubscribe } from './types'

function createCorrelationId(): SyntheticId {
  return randomString(5)
}

export interface IntentMessage {
  type: 'intent'
  correlationId: SyntheticId
  intent: Intent<any>
}

export interface ResponseMessage {
  type: 'response'
  correlationId: SyntheticId
  response: any
}

export interface ErrorMessage {
  type: 'error'
  correlationId: SyntheticId
  error: any
}

export type Message = IntentMessage | ResponseMessage | ErrorMessage

function isIntentMessage(message: Message): message is IntentMessage {
  return message.type === 'intent'
}

function isResponseMessage(message: Message): message is ResponseMessage {
  return message.type === 'response'
}

function isErrorMessage(message: Message): message is ErrorMessage {
  return message.type === 'error'
}
interface AgentWithParams {
  name: string
  message$: Observable<Message>
  dispatch(message: Message): void
}

export function createAgentWith({ name, message$, dispatch }: AgentWithParams) {
  const callbacks = new Map<
    SyntheticId,
    {
      resolve: (value: any) => void
      reject: (error: Error) => void
    }
  >()

  const resolvers = new Map<SyntheticId, Resolver>()

  const intentMessage$ = message$.pipe(filter(isIntentMessage))
  const responseMessage$ = message$.pipe(filter(isResponseMessage))
  const errorMessage$ = message$.pipe(filter(isErrorMessage))

  const subscription = new Subscription()

  subscription.add(
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
  )

  subscription.add(
    responseMessage$.subscribe(message => {
      const { correlationId, response } = message
      const callback = callbacks.get(correlationId)

      if (callback) {
        callback.resolve(response)
        callbacks.delete(correlationId)
      }
    })
  )

  subscription.add(
    errorMessage$.subscribe(message => {
      const { correlationId, error } = message
      const callback = callbacks.get(correlationId)

      if (callback) {
        callback.reject(error)
        callbacks.delete(correlationId)
      }
    })
  )

  function destroy() {
    subscription.unsubscribe()
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
        logger.warn('Intent is not cancellable', intent)
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
    name,
    raiseIntent,
    subscribeToIntent,
    subscribeToIntentAndForward,
    destroy,
  }
}
