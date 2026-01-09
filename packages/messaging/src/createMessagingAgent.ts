import { SyntheticId } from '@repro/domain'
import { logger } from '@repro/logger'
import { randomString } from '@repro/random-string'
import Future, {
  bichain,
  FutureInstance,
  reject,
  resolve,
  value,
} from 'fluture'
import { fromEvent, Subscription } from 'rxjs'
import { getTransferables } from 'transferables'
import { Agent, Intent, Resolver, Unsubscribe } from './types'

interface BaseMessage {
  sourceAgentId: SyntheticId
  phase: 'propagating' | 'routing'
}

interface AnnounceMessage extends BaseMessage {
  type: 'repro-messaging-announce'
}

interface LinkMessage extends BaseMessage {
  type: 'repro-messaging-link'
  targetAgentId: SyntheticId
}

interface RegisterMessage extends BaseMessage {
  type: 'repro-messaging-register'
  name: string
  resolutionPath: Array<SyntheticId>
  subscribedIntents: Array<string>
}

interface SubscriptionMessage extends BaseMessage {
  type: 'repro-messaging-subscription'
  intentType: string
}

interface UnsubscriptionMessage extends BaseMessage {
  type: 'repro-messaging-unsubscription'
  intentType: string
}

interface IntentMessage extends BaseMessage {
  type: 'repro-messaging-intent'
  correlationId: SyntheticId
  intent: Intent
}

interface ResponseMessage extends BaseMessage {
  type: 'repro-messaging-response'
  correlationId: SyntheticId
  intent: Intent
  response: unknown
}

interface ErrorMessage extends BaseMessage {
  type: 'repro-messaging-error'
  correlationId: SyntheticId
  intent: Intent
  error: Error
}

type InternalMessage =
  | AnnounceMessage
  | LinkMessage
  | RegisterMessage
  | SubscriptionMessage
  | UnsubscriptionMessage

type ExternalMessage = IntentMessage | ResponseMessage | ErrorMessage

type Message = InternalMessage | ExternalMessage

function createRandomId(): SyntheticId {
  return randomString(5)
}

function isMessageLike(data: unknown): data is Message {
  return (
    data != null &&
    typeof data === 'object' &&
    'type' in data &&
    typeof data.type === 'string' &&
    data.type.startsWith('repro-messaging-')
  )
}

function isAnnounceMessage(data: unknown): data is AnnounceMessage {
  return isMessageLike(data) && data.type === 'repro-messaging-announce'
}

function isLinkMessage(data: unknown): data is LinkMessage {
  return isMessageLike(data) && data.type === 'repro-messaging-link'
}

function isRegisterMessage(data: unknown): data is RegisterMessage {
  return isMessageLike(data) && data.type === 'repro-messaging-register'
}

function isSubscriptionMessage(data: unknown): data is SubscriptionMessage {
  return isMessageLike(data) && data.type === 'repro-messaging-subscription'
}

function isUnsubscriptionMessage(data: unknown): data is UnsubscriptionMessage {
  return isMessageLike(data) && data.type === 'repro-messaging-unsubscription'
}

function isIntentMessage(data: unknown): data is IntentMessage {
  return isMessageLike(data) && data.type === 'repro-messaging-intent'
}

function isResponseMessage(data: unknown): data is ResponseMessage {
  return isMessageLike(data) && data.type === 'repro-messaging-response'
}

function isErrorMessage(data: unknown): data is ErrorMessage {
  return isMessageLike(data) && data.type === 'repro-messaging-error'
}

export function createMessagingAgent({
  name,
  context = globalThis,
}: {
  name: string
  context?: typeof globalThis
}): Agent {
  const selfAgentId = createRandomId()

  // Agent discovery & intent routing
  let deferredIntentMessages: Array<IntentMessage> = []
  const resolutionTargets = new Map<string, SyntheticId>()
  const agentRegistry = new Map<
    SyntheticId,
    { name: string; resolutionPath: Array<SyntheticId> }
  >()

  // Local intent and response/error resolution
  const intentResolvers = new Map<string, Resolver>()
  const intentResponseCallbacks = new Map<
    SyntheticId,
    [(error: Error) => void, (data: any) => void]
  >()

  function hasLocalResolver(intentType: string) {
    const targetAgentId = resolutionTargets.get(intentType)
    return targetAgentId === selfAgentId
  }

  function resolveLocally(intent: Intent) {
    const resolver = intentResolvers.get(intent.type)

    if (!resolver) {
      return reject(
        new Error(
          `Missing resolver for intent "${intent.type}" in agent "${name}"`
        )
      )
    }

    return resolver(intent.payload)
  }

  function hasLocalCallback(correlationId: SyntheticId) {
    return intentResponseCallbacks.has(correlationId)
  }

  function fulfillResolutionCallback(message: ResponseMessage) {
    const resolve = intentResponseCallbacks.get(message.correlationId)?.[1]
    resolve?.(message.response)
    intentResponseCallbacks.delete(message.correlationId)
  }

  function fulfillRejectionCallback(message: ErrorMessage) {
    const reject = intentResponseCallbacks.get(message.correlationId)?.[0]
    reject?.(message.error)
    intentResponseCallbacks.delete(message.correlationId)
  }

  // Ports for network traversal
  let upstream: MessagePort | null = null
  const downstreams = new Map<SyntheticId, MessagePort>()

  // Message is traversing to top-level network node
  function isPropagating(message: Message) {
    return message.phase === 'propagating'
  }

  // Message is being handled by intermediate nodes and traversing
  // in either direction based on logic of message handlers.
  function isRouting(message: Message) {
    return message.phase === 'routing'
  }

  function hasDownstream(childAgentId: SyntheticId) {
    return downstreams.has(childAgentId)
  }

  function getNextDownstream(targetAgentId: SyntheticId): MessagePort | null {
    const resolutionPath = agentRegistry.get(targetAgentId)?.resolutionPath
    const nextAgentId = resolutionPath?.[0]

    if (!nextAgentId) {
      return null
    }

    return downstreams.get(nextAgentId) ?? null
  }

  // Current `window` context (default: globalThis.self)
  const selfContext = context.self

  // Parent `window` context (default: globalThis.parent)
  const parentContext = context.parent !== selfContext ? context.parent : null

  const subscription = new Subscription()

  function onAnnounceMessageHandler(event: MessageEvent<AnnounceMessage>) {
    const source = event.source
    const message = event.data
    const sourceAgentId = message.sourceAgentId

    if (
      sourceAgentId !== selfAgentId &&
      source &&
      !hasDownstream(sourceAgentId)
    ) {
      const channel = new MessageChannel()
      downstreams.set(sourceAgentId, channel.port1)
      channel.port1.start()

      const message: LinkMessage = {
        type: 'repro-messaging-link',
        sourceAgentId: selfAgentId,
        targetAgentId: sourceAgentId,
        phase: 'routing',
      }

      source.postMessage(message, {
        targetOrigin: event.origin,
        transfer: [channel.port2],
      })

      subscription.add(
        fromEvent<MessageEvent>(channel.port1, 'message').subscribe(
          onMessageHandler
        )
      )
    }
  }

  function onLinkMessageHandler(event: MessageEvent<LinkMessage>) {
    const message = event.data
    const targetAgentId = message.targetAgentId

    if (targetAgentId === selfAgentId) {
      const port = event.ports[0]

      if (port) {
        upstream = port
        port.start()

        const registerMessage: RegisterMessage = {
          type: 'repro-messaging-register',
          resolutionPath: [selfAgentId],
          // Pass existing subscriptions during handshake
          subscribedIntents: Array.from(intentResolvers.keys()),
          name,
          sourceAgentId: selfAgentId,
          phase: 'routing',
        }

        dispatch(upstream, registerMessage)

        subscription.add(
          fromEvent<MessageEvent>(upstream, 'message').subscribe(
            onMessageHandler
          )
        )
      }
    }
  }

  function onRegisterMessageHandler(event: MessageEvent<RegisterMessage>) {
    const message = event.data

    // Write intermediate resolution paths.
    // When routing responses, look up target agent ID for `intentType` in `resolutionTargets`
    // and find next hop in locally stored `resolutionPaths` on each messaging node.
    agentRegistry.set(message.sourceAgentId, {
      name: message.name,
      resolutionPath: message.resolutionPath,
    })

    for (const intentType of message.subscribedIntents) {
      resolutionTargets.set(intentType, message.sourceAgentId)
    }

    if (message.subscribedIntents.length > 0) {
      flushDeferredIntents(message.subscribedIntents)
    }

    message.resolutionPath = [selfAgentId, ...message.resolutionPath]

    if (upstream) {
      dispatch(upstream, message)
    }
  }

  function onSubscriptionMessageHandler(
    event: MessageEvent<SubscriptionMessage>
  ) {
    const message = event.data
    resolutionTargets.set(message.intentType, message.sourceAgentId)

    flushDeferredIntents([message.intentType])

    if (upstream) {
      dispatch(upstream, message)
    }
  }

  function onUnsubscriptionMessageHandler(
    event: MessageEvent<UnsubscriptionMessage>
  ) {
    const message = event.data
    resolutionTargets.delete(message.sourceAgentId)

    if (upstream) {
      dispatch(upstream, message)
    }
  }

  function onIntentMessageHandler(event: MessageEvent<IntentMessage>) {
    const message = event.data
    const intent = message.intent

    if (hasLocalResolver(intent.type)) {
      const result = resolveLocally(message.intent)

      const messageFut = result.pipe(
        bichain<Error, never, Message>(error =>
          resolve<ErrorMessage>({
            type: 'repro-messaging-error',
            correlationId: message.correlationId,
            sourceAgentId: message.sourceAgentId,
            phase: 'propagating',
            intent,
            error,
          })
        )(response =>
          resolve<ResponseMessage>({
            type: 'repro-messaging-response',
            correlationId: message.correlationId,
            sourceAgentId: message.sourceAgentId,
            phase: 'propagating',
            intent,
            response,
          })
        )
      )

      messageFut.pipe(
        value(message => {
          dispatchLocally(message)
        })
      )
    } else {
      const targetAgentId = resolutionTargets.get(intent.type)

      if (targetAgentId) {
        const downstream = getNextDownstream(targetAgentId)

        if (downstream) {
          dispatch(downstream, message)
        }
      } else {
        logger.warn(
          `MessagingAgent (${name}): No resolution target for "${message.intent.type}". Awaiting subscription.`
        )
        deferredIntentMessages.push(message)
      }
    }
  }

  function onResponseMessageHandler(event: MessageEvent<ResponseMessage>) {
    const message = event.data

    if (hasLocalCallback(message.correlationId)) {
      fulfillResolutionCallback(message)
    } else {
      const downstream = getNextDownstream(message.sourceAgentId)

      if (downstream) {
        dispatch(downstream, message)
      }
    }
  }

  function onErrorMessageHandler(event: MessageEvent<ErrorMessage>) {
    const message = event.data

    if (hasLocalCallback(message.correlationId)) {
      fulfillRejectionCallback(message)
    } else {
      const downstream = getNextDownstream(message.sourceAgentId)

      if (downstream) {
        dispatch(downstream, message)
      }
    }
  }

  function onMessageHandler(event: MessageEvent) {
    if (isMessageLike(event.data)) {
      const message = event.data

      if (isPropagating(message)) {
        if (upstream) {
          dispatch(upstream, message)
        } else {
          // Upon reaching the top-level upstream, switch to routing phase
          message.phase = 'routing'
        }
      }

      if (isRouting(message)) {
        if (isAnnounceMessage(message)) {
          onAnnounceMessageHandler(event)
        } else if (isLinkMessage(message)) {
          onLinkMessageHandler(event)
        } else if (isRegisterMessage(message)) {
          onRegisterMessageHandler(event)
        } else if (isSubscriptionMessage(message)) {
          onSubscriptionMessageHandler(event)
        } else if (isUnsubscriptionMessage(message)) {
          onUnsubscriptionMessageHandler(event)
        } else if (isIntentMessage(message)) {
          onIntentMessageHandler(event)
        } else if (isResponseMessage(message)) {
          onResponseMessageHandler(event)
        } else if (isErrorMessage(message)) {
          onErrorMessageHandler(event)
        }
      }
    }
  }

  subscription.add(
    fromEvent<MessageEvent>(selfContext, 'message').subscribe(onMessageHandler)
  )

  function dispatch(target: MessageEventSource, message: Message) {
    target.postMessage(message, {
      targetOrigin: '*',
      transfer: getTransferables(message, true),
    })
  }

  function dispatchLocally(message: Message) {
    onMessageHandler(
      new MessageEvent('message', {
        data: message,
      })
    )
  }

  function flushDeferredIntents(intentTypes: Array<string>) {
    let intentMessage: IntentMessage | undefined
    const nextDeferredIntentMessages: Array<IntentMessage> = []

    while ((intentMessage = deferredIntentMessages.shift())) {
      if (intentTypes.includes(intentMessage.intent.type)) {
        dispatchLocally(intentMessage)
      } else {
        nextDeferredIntentMessages.push(intentMessage)
      }
    }

    deferredIntentMessages = nextDeferredIntentMessages
  }

  function announce() {
    const target = parentContext ?? selfContext

    if (upstream === null) {
      const message: AnnounceMessage = {
        type: 'repro-messaging-announce',
        sourceAgentId: selfAgentId,
        phase: 'routing',
      }

      dispatch(target, message)
    }
  }

  function raiseIntent<R, P = any>(
    intent: Intent<P>
  ): FutureInstance<Error, R> {
    const correlationId = createRandomId()

    const message: IntentMessage = {
      type: 'repro-messaging-intent',
      correlationId,
      intent,
      sourceAgentId: selfAgentId,
      phase: 'propagating',
    }

    dispatchLocally(message)

    return Future((reject, resolve) => {
      intentResponseCallbacks.set(correlationId, [reject, resolve])

      return () => {
        intentResponseCallbacks.delete(correlationId)
      }
    })
  }

  function subscribeToIntent(type: string, resolver: Resolver): Unsubscribe {
    if (intentResolvers.has(type)) {
      throw new Error(
        `MessagingAgent: resolver already registered for type "${type}"`
      )
    }

    const message: SubscriptionMessage = {
      type: 'repro-messaging-subscription',
      intentType: type,
      sourceAgentId: selfAgentId,
      phase: 'routing',
    }

    dispatchLocally(message)

    intentResolvers.set(type, resolver)

    return () => {
      const message: UnsubscriptionMessage = {
        type: 'repro-messaging-unsubscription',
        intentType: type,
        sourceAgentId: selfAgentId,
        phase: 'routing',
      }

      dispatchLocally(message)

      intentResolvers.delete(type)
    }
  }

  function destroy() {
    intentResolvers.clear()
    subscription.unsubscribe()
  }

  announce()

  return {
    name: 'MessagingAgent',
    raiseIntent,
    subscribeToIntent,
    destroy,
  }
}
