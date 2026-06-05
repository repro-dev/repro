import { EXTENSION_SYSTEM_CARD_MESSAGE } from '../../model/system'
import {
  makeAccessor,
  makeConsoleErrorEvent,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makePageTransitionEvent,
} from '../../model/tools/__tests__/helpers'
import { EvalFixture } from '../runner'

// Fixture: an initial failed network request (GET /api/user returning 401)
// causes a cascade of TypeErrors as dependent components try to render with
// undefined user data. The agent must identify the root cause (401 on the user
// fetch) rather than the downstream TypeError cascades.
// Exercises: getNetworkRequests, findErrors, getConsoleMessages
export function createFixture(): EvalFixture {
  const events = [
    makePageTransitionEvent(500, 'https://app.example.com/home'),
    makeFetchRequestEvent(
      600,
      'req1',
      'https://api.example.com/api/user',
      'GET'
    ),
    // Root cause: user not authenticated
    makeFetchResponseEvent(900, 'req1', 401),
    makeConsoleErrorEvent(910, 'Unauthorized: please log in', [
      {
        functionName: 'loadUserData',
        fileName: 'app.js',
        lineNumber: 23,
        columnNumber: 5,
      },
    ]),
    // Downstream cascade: components render before user data is available
    makeConsoleErrorEvent(
      950,
      'TypeError: Cannot read properties of null (reading "name")',
      [
        {
          functionName: 'renderUserGreeting',
          fileName: 'home.js',
          lineNumber: 45,
          columnNumber: 12,
        },
      ]
    ),
    makeConsoleErrorEvent(
      980,
      'TypeError: Cannot read properties of undefined (reading "avatar")',
      [
        {
          functionName: 'renderAvatar',
          fileName: 'home.js',
          lineNumber: 67,
          columnNumber: 8,
        },
      ]
    ),
  ]

  const accessor = makeAccessor(events, 5000)

  return {
    name: 'multi-step-error-chain',
    prompt:
      "The home page is completely broken — multiple errors and the page won't load. What's the root cause?",
    expectedOutcomeDescription:
      'The agent identifies that the root cause is a 401 Unauthorized response to GET /api/user at 0.9s, indicating the user is not authenticated. The subsequent TypeErrors in renderUserGreeting and renderAvatar are downstream cascades caused by the user data being null/undefined because the initial fetch failed. Fixing authentication will resolve the cascade.',
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: 'EXTENSION_SYSTEM_CARD_MESSAGE',
  }
}
