import { EXTENSION_SYSTEM_CARD_MESSAGE } from '../../model/system'
import {
  makeAccessor,
  makeConsoleErrorEvent,
  makeConsoleInfoEvent,
  makePageTransitionEvent,
} from '../../model/tools/__tests__/helpers'
import { EvalFixture } from '../runner'

// Fixture: a pure client-side ReferenceError thrown in a component's render
// function when accessing an uninitialized variable. No network involvement at
// all — the agent must recognise this as a client-side initialization error.
// Exercises: findErrors, getConsoleMessages
export function createFixture(): EvalFixture {
  const events = [
    makePageTransitionEvent(500, 'https://app.example.com/dashboard'),
    makeConsoleInfoEvent(1000, 'Dashboard mounted'),
    makeConsoleErrorEvent(2500, 'ReferenceError: userProfile is not defined', [
      {
        functionName: 'renderHeader',
        fileName: 'dashboard.js',
        lineNumber: 87,
        columnNumber: 5,
      },
    ]),
  ]

  const accessor = makeAccessor(events, 6000)

  return {
    name: 'console-error-no-network-failure',
    prompt: "The dashboard page is broken. What's wrong?",
    expectedOutcomeDescription:
      'The agent identifies a ReferenceError thrown in renderHeader at dashboard.js:87 at 2.5s, where userProfile is accessed before it is defined. There is no network failure, indicating this is a pure client-side initialization error.',
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: 'EXTENSION_SYSTEM_CARD_MESSAGE',
  }
}
