import { logger } from '@repro/logger'
import { Agent, getDefaultAgent, Unsubscribe } from '@repro/messaging'
import { randomString } from '@repro/random-string'
import { fork } from 'fluture'
import { TrackedEvent } from './types'

type Properties = Record<string, string>
type Consumer = (agent: Agent, identityId?: string | null) => Unsubscribe

let activeAgent: Agent | null = null
let activeIdentityId: string | null = null
let activeConsumer: Unsubscribe | null = null

function createEventId() {
  return randomString()
}

export const Analytics = {
  setIdentity(identityId: string) {
    activeIdentityId = identityId
  },

  getAgent() {
    return activeAgent ?? getDefaultAgent()
  },

  setAgent(agent: Agent) {
    activeAgent = agent
  },

  registerConsumer(consumer: Consumer) {
    if (activeConsumer) {
      activeConsumer()
    }

    activeConsumer = consumer(this.getAgent(), activeIdentityId)
  },

  track(event: string, props: Properties = {}) {
    fork(logger.error)(() => undefined)(
      this.getAgent().raiseIntent<void, TrackedEvent>({
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
