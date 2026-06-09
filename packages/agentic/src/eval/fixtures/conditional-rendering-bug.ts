import { NodeId, NodeType, Snapshot } from '@repro/domain'
import { Box } from '@repro/tdl'
import { EXTENSION_SYSTEM_CARD_MESSAGE } from '../../model/system'
import {
  makeAccessor,
  makeAddNodesPatchEvent,
  makeConsoleInfoEvent,
  makeRemoveNodesPatchEvent,
  makeSnapshotEvent,
} from '../../model/tools/__tests__/helpers'
import { EvalFixture } from '../runner'

// Snapshot at t=1000 with a "confirmation-banner" div present.
// An AddNodes patch at t=1500 adds the banner, and a RemoveNodes patch at
// t=3000 removes it — simulating a conditional rendering bug where a
// confirmation message briefly appears then disappears.
// Exercises: getDOMState, getDOMDiff
export function createFixture(): EvalFixture {
  // The banner nodeId used across snapshot and patch events
  const BANNER_ID = 'ban01'

  // Initial snapshot at t=1000: includes the confirmation-banner element
  function snapshotFn(timestampMs: number): Snapshot | null {
    if (timestampMs < 1000) {
      return null
    }

    // After the snapshot event at t=1000, the banner is present in the DOM
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
            children: [BANNER_ID] as NodeId[],
            attributes: {} as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
          }),
          [BANNER_ID]: new Box({
            type: NodeType.Element as NodeType.Element,
            id: BANNER_ID as NodeId,
            parentId: 'body' as NodeId,
            tagName: 'div',
            children: [] as NodeId[],
            attributes: {
              id: 'confirmation-banner',
              class: 'confirmation-banner',
            } as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
          }),
        },
      },
      interaction: null,
      frameworkState: null,
      cssRules: null,
    }
  }

  const events = [
    // Noise event at t=800: a routine info log, not related to the bug
    makeConsoleInfoEvent(800, 'Page ready'),
    // Snapshot event at t=1000 establishes initial DOM with confirmation-banner
    makeSnapshotEvent(1000),
    // AddNodes at t=1500: banner element added to body
    makeAddNodesPatchEvent(1500, 'body', [BANNER_ID]),
    // RemoveNodes at t=3000: same banner removed
    makeRemoveNodesPatchEvent(3000, 'body', [BANNER_ID]),
  ]

  const accessor = makeAccessor(events, 6000, snapshotFn)

  return {
    name: 'conditional-rendering-bug',
    prompt:
      'A confirmation message appears briefly after a form submission but then immediately disappears. What is happening?',
    expectedOutcomeDescription:
      'The agent identifies that an element (confirmation-banner / div) was added to the DOM around 1500ms and then removed around 3000ms, suggesting a conditional rendering issue where the confirmation message briefly appears and then disappears unexpectedly',
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: 'EXTENSION_SYSTEM_CARD_MESSAGE',
  }
}
