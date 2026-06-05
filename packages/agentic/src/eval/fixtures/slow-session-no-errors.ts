import { EXTENSION_SYSTEM_CARD_MESSAGE } from '../../model/system'
import {
  makeAccessor,
  makeConsoleInfoEvent,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makePageTransitionEvent,
} from '../../model/tools/__tests__/helpers'
import { EvalFixture } from '../runner'

// Fixture: no errors, no DOM bugs. The session shows three sequential network
// requests during page initialization (waterfall pattern — each starts only
// after the previous completes), totalling ~2.4s of sequential waiting before
// the page is interactive. The agent must identify the chained requests as the
// cause of the perceived slowness.
// Exercises: getNetworkRequests, getConsoleMessages
export function createFixture(): EvalFixture {
  const events = [
    makePageTransitionEvent(500, 'https://app.example.com/reports'),
    makeConsoleInfoEvent(600, 'Reports page init'),
    makeFetchRequestEvent(
      700,
      'req1',
      'https://api.example.com/api/config',
      'GET'
    ),
    makeFetchResponseEvent(1200, 'req1', 200), // 500ms
    // req2 starts only after req1 completes — sequential dependency
    makeFetchRequestEvent(
      1250,
      'req2',
      'https://api.example.com/api/user',
      'GET'
    ),
    makeFetchResponseEvent(1900, 'req2', 200), // 650ms
    // req3 starts only after req2 completes — sequential dependency
    makeFetchRequestEvent(
      1950,
      'req3',
      'https://api.example.com/api/reports',
      'GET'
    ),
    makeFetchResponseEvent(3100, 'req3', 200), // 1150ms
    makeConsoleInfoEvent(3200, 'Reports ready'),
  ]

  const accessor = makeAccessor(events, 5000)

  return {
    name: 'slow-session-no-errors',
    prompt:
      "The reports page takes a long time to load and feels slow. There are no visible errors. What's causing the slowness?",
    expectedOutcomeDescription:
      'The agent identifies a sequential (waterfall) pattern of three network requests during page initialization: GET /api/config (500ms), GET /api/user (650ms), and GET /api/reports (1150ms), each starting only after the previous completes, totalling approximately 2.4s of sequential waiting before the page becomes ready. The requests appear to be chained dependencies that could be parallelized to reduce load time.',
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: 'EXTENSION_SYSTEM_CARD_MESSAGE',
  }
}
