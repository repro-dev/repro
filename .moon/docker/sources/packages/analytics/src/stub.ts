import { logger } from '@repro/logger'
import { Agent } from '@repro/messaging'
import { resolve } from 'fluture'
import { TrackedEvent } from './types'

export function stubConsumer(agent: Agent, _identityId: string | null = null) {
  return agent.subscribeToIntent(
    'analytics:track',
    ({ name, time, props }: TrackedEvent) => {
      logger.debug('analytics:track', name, time, props)
      return resolve(null)
    }
  )
}
