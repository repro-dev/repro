import { logger } from '@repro/logger'
import { Agent, DEFAULT_AGENT, Unsubscribe } from '@repro/messaging'
import { randomString } from '@repro/random-string'
import { fork } from 'fluture'
import { stubConsumer } from './stub'
import { TrackedEvent } from './types'

type Properties = Record<string, string>
type Consumer = (agent: Agent, identityId?: string | null) => Unsubscribe

let activeAgent: Agent = DEFAULT_AGENT
let activeIdentityId: string | null = null
let activeConsumer: Unsubscribe = stubConsumer(activeAgent)

function createEventId() {
  return randomString()
}

export const Analytics = {
  setIdentity(identityId: string) {
    activeIdentityId = identityId
  },

  setAgent(agent: Agent) {
    activeAgent = agent
  },

  registerConsumer(consumer: Consumer) {
    if (activeConsumer) {
      activeConsumer()
    }

    activeConsumer = consumer(activeAgent, activeIdentityId)
  },

  track(event: string, props: Properties = {}) {
    fork(logger.error)(() => undefined)(
      activeAgent.raiseIntent<void, TrackedEvent>({
        type: 'analytics:track',
        payload: {
          eventId: createEventId(),
          name: event,
          time: Date.now(),
          props,
        },
      })
    )
  },
}
