import { EXTENSION_SYSTEM_CARD_MESSAGE } from '../../model/system'
import {
  makeAccessor,
  makeConsoleErrorEvent,
  makeConsoleInfoEvent,
  makePageTransitionEvent,
  makeWebSocketCloseEvent,
  makeWebSocketOpenEvent,
  makeWebSocketOutboundEvent,
} from '../../model/tools/__tests__/helpers'
import { EvalFixture } from '../runner'

// Fixture: a WebSocket connection is opened for a live feed; the client sends
// a subscribe message, but the expected inbound data message never arrives.
// The connection closes after a timeout and an error is logged. The agent must
// identify the missing inbound data as the cause of the empty feed.
// Exercises: getNetworkRequests, findErrors, getConsoleMessages
export function createFixture(): EvalFixture {
  const events = [
    makePageTransitionEvent(500, 'https://app.example.com/feed'),
    makeConsoleInfoEvent(1000, 'Live feed initialized'),
    makeWebSocketOpenEvent(1500, 'ws1', 'wss://api.example.com/ws/feed'),
    makeWebSocketOutboundEvent(
      2000,
      'ws1',
      '{"type":"subscribe","channel":"updates"}'
    ),
    // No inbound message ever arrives — the server does not send any data
    makeWebSocketCloseEvent(12000, 'ws1'),
    makeConsoleErrorEvent(
      12010,
      'WebSocket closed unexpectedly: no data received',
      [
        {
          functionName: 'onWsClose',
          fileName: 'feed.js',
          lineNumber: 78,
          columnNumber: 3,
        },
      ]
    ),
  ]

  const accessor = makeAccessor(events, 15000)

  return {
    name: 'websocket-message-missing',
    prompt:
      "The live feed page isn't showing any updates. The page loads fine but the feed stays empty. What's happening?",
    expectedOutcomeDescription:
      'The agent identifies that a WebSocket connection was opened to wss://api.example.com/ws/feed at 1.5s, a subscribe message was sent at 2.0s, but no inbound data was ever received. The connection closed at 12.0s and a console error indicates no data was received, suggesting the server is not sending updates — possibly the subscription was not acknowledged or the channel is not publishing.',
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: 'EXTENSION_SYSTEM_CARD_MESSAGE',
  }
}
