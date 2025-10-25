import { FutureInstance, reject } from 'fluture'
import { Agent, Intent, Resolver, Unsubscribe } from './types'

export function createLoopbackAgent(): Agent {
  const resolvers = new Map<string, Resolver>()

  function destroy() {
    resolvers.clear()
  }

  function raiseIntent<R, P = any>(
    intent: Intent<P>
  ): FutureInstance<Error, R> {
    const resolver = resolvers.get(intent.type)

    if (resolver) {
      return resolver(intent.payload)
    }

    return reject(
      new Error(`LoopbackAgent: cannot find resolver for type "${intent.type}"`)
    )
  }

  function subscribeToIntent(type: string, resolver: Resolver): Unsubscribe {
    if (resolvers.has(type)) {
      throw new Error(
        `LoopbackAgent: resolver already registered for type "${type}"`
      )
    }

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
    name: 'LoopbackAgent',
    raiseIntent,
    subscribeToIntent,
    subscribeToIntentAndForward,
    destroy,
  }
}
