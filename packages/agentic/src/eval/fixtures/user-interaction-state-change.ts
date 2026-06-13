import { NodeId, NodeType, Snapshot } from '@repro/domain'
import { Box } from '@repro/tdl'
import { EXTENSION_SYSTEM_CARD_MESSAGE } from '../../model/system'
import {
  makeAccessor,
  makeClickEvent,
  makeConsoleErrorEvent,
  makePageTransitionEvent,
  makeSnapshotEvent,
} from '../../model/tools/__tests__/helpers'
import { EvalFixture } from '../runner'

// A recording where clicking a toggle button ("Enable Notifications") causes
// an unexpected page navigation to /login instead of staying on /settings.
// A "Session expired" console error appears shortly after.
// Exercises: getEventsAroundTime, getElementDetails
export function createFixture(): EvalFixture {
  const TOGGLE_ID = 'tog01'

  // Snapshot at t=2900: settings page with a toggle button visible
  function snapshotFn(timestampMs: number): Snapshot | null {
    if (timestampMs < 2900) {
      return null
    }

    return {
      dom: {
        rootId: 'root',
        nodes: {
          root: new Box({
            type: NodeType.Document as NodeType.Document,
            id: 'root' as NodeId,
            parentId: null,
            children: ['body'] as NodeId[],
          }),
          body: new Box({
            type: NodeType.Element as NodeType.Element,
            id: 'body' as NodeId,
            parentId: 'root' as NodeId,
            tagName: 'body',
            children: [TOGGLE_ID] as NodeId[],
            attributes: {} as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
            slotAssignments: null,
          }),
          [TOGGLE_ID]: new Box({
            type: NodeType.Element as NodeType.Element,
            id: TOGGLE_ID as NodeId,
            parentId: 'body' as NodeId,
            tagName: 'button',
            children: [] as NodeId[],
            attributes: {
              'aria-label': 'Enable Notifications',
              role: 'switch',
              'aria-checked': 'false',
            } as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
            slotAssignments: null,
          }),
        },
      },
      interaction: null,
      frameworkState: null,
      cssRules: null,
    }
  }

  const events = [
    makePageTransitionEvent(1000, 'https://app.example.com/settings'),
    // Snapshot event at t=2900 establishes settings page state just before the click
    makeSnapshotEvent(2900),
    // User clicks the toggle at t=3000
    makeClickEvent(3000, 'Enable Notifications'),
    // Unexpected redirect to /login at t=3050 (should stay on /settings)
    makePageTransitionEvent(
      3050,
      'https://app.example.com/login',
      'https://app.example.com/settings'
    ),
    // Session expired error appears at t=3100
    makeConsoleErrorEvent(3100, 'Session expired'),
  ]

  const accessor = makeAccessor(events, 8000, snapshotFn)

  return {
    name: 'user-interaction-state-change',
    prompt:
      "When the user clicks the 'Enable Notifications' toggle on the settings page, they get redirected to the login page instead. What is causing this?",
    expectedOutcomeDescription:
      "The agent identifies that clicking the 'Enable Notifications' toggle at 3000ms triggered an unexpected page transition to /login at 3050ms, and a 'Session expired' console error appeared 100ms later, suggesting the toggle action triggered a session check that failed",
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: 'EXTENSION_SYSTEM_CARD_MESSAGE',
  }
}
