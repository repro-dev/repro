import { TrackedEvent } from '@repro/analytics'
import { Agent } from '@repro/messaging'
import { attemptP, map } from 'fluture'

const apiUrl = (process.env.MIXPANEL_API_URL || '').replace(/\/$/, '')

export function register(agent: Agent, identityId: string | null = null) {
  return agent.subscribeToIntent(
    'analytics:track',
    ({ eventId, name, time, props }: TrackedEvent) => {
      return attemptP<Error, Response>(() =>
        fetch(`${apiUrl}/track`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([
            {
              event: name,
              properties: {
                ...props,
                time,
                token: process.env.MIXPANEL_TOKEN || '',
                distinct_id: identityId,
                $insert_id: eventId,
              },
            },
          ]),
        })
      ).pipe(map(() => undefined))
    }
  )
}
