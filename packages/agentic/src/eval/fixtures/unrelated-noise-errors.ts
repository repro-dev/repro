import { LogLevel } from '@repro/domain'
import { EXTENSION_SYSTEM_CARD_MESSAGE } from '../../model/system'
import {
  makeAccessor,
  makeClickEvent,
  makeConsoleErrorEvent,
  makeConsoleEvent,
  makeConsoleInfoEvent,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makePageTransitionEvent,
} from '../../model/tools/__tests__/helpers'
import { EvalFixture } from '../runner'

// Fixture: a session with two unrelated noise signals (third-party analytics
// 404 + a console warning) plus the actual bug: a failed POST /api/drafts when
// the user clicks Save Draft. The agent must identify the save failure as the
// root cause of the user's complaint and not be misled by the early noise.
// Exercises: getNetworkRequests, findErrors, getConsoleMessages, getInteractionEvents
export function createFixture(): EvalFixture {
  const events = [
    makePageTransitionEvent(500, 'https://app.example.com/editor'),
    // Third-party analytics — failing at page load, unrelated to the bug
    makeFetchRequestEvent(
      600,
      'analytics1',
      'https://analytics.thirdparty.com/track',
      'POST'
    ),
    makeFetchResponseEvent(650, 'analytics1', 404),
    makeConsoleEvent(
      700,
      LogLevel.Warning,
      'Analytics tracking failed: endpoint not found'
    ),
    makeConsoleInfoEvent(1000, 'Editor loaded'),
    // User action — this is where the actual bug occurs
    makeClickEvent(4000, 'Save Draft'),
    makeFetchRequestEvent(
      4100,
      'req2',
      'https://api.example.com/api/drafts',
      'POST'
    ),
    makeFetchResponseEvent(4500, 'req2', 503),
    makeConsoleErrorEvent(4510, 'Failed to save draft: service unavailable', [
      {
        functionName: 'saveDraft',
        fileName: 'editor.js',
        lineNumber: 134,
        columnNumber: 8,
      },
    ]),
  ]

  const accessor = makeAccessor(events, 10000)

  return {
    name: 'unrelated-noise-errors',
    prompt:
      "The user tried to save their draft but it didn't work. What caused the failure?",
    expectedOutcomeDescription:
      "The agent correctly identifies that clicking 'Save Draft' at 4.0s triggered a POST /api/drafts request that failed with a 503 at 4.5s, and a 'service unavailable' error was thrown in saveDraft at editor.js:134. The analytics 404 at 0.65s is a pre-existing third-party tracking failure unrelated to the save operation.",
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: 'EXTENSION_SYSTEM_CARD_MESSAGE',
  }
}
