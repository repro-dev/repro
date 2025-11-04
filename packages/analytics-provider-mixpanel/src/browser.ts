import { TrackedEvent } from '@repro/analytics'
import { Agent } from '@repro/messaging'
import { node } from 'fluture'
import mixpanel from 'mixpanel-browser'

export function createMixpanelBrowserConsumer(token: string, debug = false) {
  return function register(agent: Agent, identityId: string | null = null) {
    mixpanel.init(token || '', { debug })

    if (identityId !== null) {
      mixpanel.identify(identityId)
    }

    return agent.subscribeToIntent(
      'analytics:track',
      ({ name, time, props }: TrackedEvent) => {
        return node(done =>
          mixpanel.track(name, { time, ...props }, _ => {
            done(null)
          })
        )
      }
    )
  }
}
