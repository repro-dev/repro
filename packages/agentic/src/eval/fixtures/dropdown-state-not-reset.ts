import { NodeId, NodeType, Snapshot } from '@repro/domain'
import { Box } from '@repro/tdl'
import { WORKSPACE_SYSTEM_CARD_MESSAGE } from '../../model/system'
import {
  makeAccessor,
  makeAttributePatchEvent,
  makeClickEvent,
  makePageTransitionEvent,
  makeSnapshotEvent,
} from '../../model/tools/__tests__/helpers'
import { EvalFixture } from '../runner'

// Fixture: the user selects an option from a dropdown filter, navigates away,
// then navigates back. The dropdown retains the previously selected value instead
// of resetting to the default. No errors, no network failures.
// Exercises: getDOMState, getDOMDiff (pure DOM path)
export function createFixture(): EvalFixture {
  // Snapshot states:
  //   [1000, 5000) → filter page, dropdown at default ("---")
  //   [5000, ∞)    → filter page after back-navigation, dropdown still shows "option-b" (bug)
  function snapshotFn(timestampMs: number): Snapshot | null {
    if (timestampMs < 1000) {
      return null
    }

    const dataValue = timestampMs >= 5000 ? 'option-b' : '---'

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
            children: ['filter-bar'] as NodeId[],
            attributes: {} as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
          }),
          'filter-bar': new Box({
            type: NodeType.Element as NodeType.Element,
            id: 'filter-bar' as NodeId,
            parentId: 'body' as NodeId,
            tagName: 'div',
            children: ['sel-category'] as NodeId[],
            attributes: { id: 'filter-bar' } as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
          }),
          'sel-category': new Box({
            type: NodeType.Element as NodeType.Element,
            id: 'sel-category' as NodeId,
            parentId: 'filter-bar' as NodeId,
            tagName: 'select',
            children: [] as NodeId[],
            attributes: {
              id: 'sel-category',
              'aria-label': 'Category filter',
              'data-value': dataValue,
            } as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
          }),
        },
      },
      interaction: null,
      frameworkState: null,
    }
  }

  const events = [
    makePageTransitionEvent(500, 'https://app.example.com/reports'),
    makeSnapshotEvent(1000),
    // User clicks the category dropdown and selects "Option B"
    makeClickEvent(2400, 'Category filter', [300, 200], {
      id: 'sel-category',
      tagName: 'select',
      attributes: { 'aria-label': 'Category filter', 'data-value': '---' },
    }),
    // Attribute patch: dropdown value changes from default to selected option
    makeAttributePatchEvent(
      2500,
      'sel-category',
      'data-value',
      'option-b',
      '---'
    ),
    // User navigates away
    makePageTransitionEvent(4000, 'https://app.example.com/dashboard'),
    // User navigates back
    makePageTransitionEvent(4800, 'https://app.example.com/reports'),
    makeSnapshotEvent(5000),
    // App re-renders but does not reset the dropdown — same stale value persists
    makeAttributePatchEvent(
      5200,
      'sel-category',
      'data-value',
      'option-b',
      'option-b'
    ),
  ]

  const accessor = makeAccessor(events, 7000, snapshotFn)

  return {
    name: 'dropdown-state-not-reset',
    prompt:
      'After navigating back to the reports page, the category filter dropdown is still showing the previously selected option. It should reset to the default when navigating away and back. What is happening?',
    expectedOutcomeDescription:
      'The agent identifies that the dropdown element (sel-category / select) had its data-value attribute set to "option-b" at ~2500ms when the user selected an option. After navigating away and back, a snapshot at ~5000ms shows the dropdown still has data-value="option-b" instead of the default "---". A subsequent attribute patch at ~5200ms sets data-value to "option-b" again (no change), confirming that the component is not resetting filter state on navigation — the dropdown state persists across route changes.',
    accessor,
    systemPrompt: WORKSPACE_SYSTEM_CARD_MESSAGE,
    promptExportName: 'WORKSPACE_SYSTEM_CARD_MESSAGE',
  }
}
