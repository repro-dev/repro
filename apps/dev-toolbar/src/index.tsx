import { Stats, Trace } from '@repro/diagnostics'
import { logger } from '@repro/logger'
import { getDefaultAgent } from '@repro/messaging'
import { resolve } from 'fluture'
import { attach, detach, usingAgent } from './ReproDevToolbar'

declare global {
  const __BUILD_VERSION__: string | undefined
}

const standalone = process.env.MODE === 'standalone'

if (process.env.NODE_ENV === 'development') {
  logger.debug('Repro build version:', __BUILD_VERSION__)
  logger.debug('Repro build mode:', process.env.MODE ?? '(default: extension)')
  logger.debug('Repro page startup time:', performance.now())

  Stats.enable()
  Trace.enable()
}

const agent = getDefaultAgent()
usingAgent(agent)

agent.subscribeToIntent('enable', ({ recording }) => {
  return attach(recording)
})

agent.subscribeToIntent('disable', () => {
  detach()
  return resolve<void>(undefined)
})

// Auto-start in standalone build
if (standalone) {
  agent.raiseIntent({
    type: 'enable',
  })
}
