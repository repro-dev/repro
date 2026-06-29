import { NodeId, NodeType, Snapshot } from '@repro/domain'
import { Box } from '@repro/tdl'
import { EXTENSION_SYSTEM_CARD_MESSAGE } from '../../model/system'
import {
  makeAccessor,
  makeAddNodesPatchEvent,
  makeClickEvent,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makeKeyDownEvent,
  makePageTransitionEvent,
  makeRemoveNodesPatchEvent,
  makeSnapshotEvent,
} from '../../model/tools/__tests__/helpers'
import { EvalFixture } from '../runner'

// Fixture: the user types a password confirmation and clicks "Delete Account".
// The DELETE /api/account request returns 403 Forbidden. Immediately after,
// the delete button is removed from the DOM and a "Contact support" link is
// added in its place. The question is vague ("nothing happened").
// Exercises: findErrors, getNetworkRequests, getDOMDiff, getUserActions
export function createFixture(): EvalFixture {
  // Snapshot states:
  //   [1000, 4400) → account settings page with delete button
  //   [4400, ∞)    → same page but btn-delete replaced by lnk-support
  function snapshotFn(timestampMs: number): Snapshot | null {
    if (timestampMs < 1000) {
      return null
    }

    if (timestampMs >= 4400) {
      // Post-rejection DOM: delete button removed, support link present
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
              children: ['actions'] as NodeId[],
              attributes: {} as Record<string, string | null>,
              properties: { value: null, checked: null, selectedIndex: null },
              shadowRoot: false,
              slotAssignments: null,
            }),
            actions: new Box({
              type: NodeType.Element as NodeType.Element,
              id: 'actions' as NodeId,
              parentId: 'body' as NodeId,
              tagName: 'div',
              children: ['lnk-support'] as NodeId[],
              attributes: {
                id: 'actions',
              } as Record<string, string | null>,
              properties: { value: null, checked: null, selectedIndex: null },
              shadowRoot: false,
              slotAssignments: null,
            }),
            'lnk-support': new Box({
              type: NodeType.Element as NodeType.Element,
              id: 'lnk-support' as NodeId,
              parentId: 'actions' as NodeId,
              tagName: 'a',
              children: [] as NodeId[],
              attributes: {
                id: 'lnk-support',
                href: '/support',
                'aria-label': 'Contact support',
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
        colorScheme: null,
      }
    }

    // Pre-rejection DOM: delete button and password confirmation input visible
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
            children: ['actions'] as NodeId[],
            attributes: {} as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
            slotAssignments: null,
          }),
          actions: new Box({
            type: NodeType.Element as NodeType.Element,
            id: 'actions' as NodeId,
            parentId: 'body' as NodeId,
            tagName: 'div',
            children: ['inp-confirm', 'btn-delete'] as NodeId[],
            attributes: {
              id: 'actions',
            } as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
            slotAssignments: null,
          }),
          'inp-confirm': new Box({
            type: NodeType.Element as NodeType.Element,
            id: 'inp-confirm' as NodeId,
            parentId: 'actions' as NodeId,
            tagName: 'input',
            children: [] as NodeId[],
            attributes: {
              id: 'inp-confirm',
              type: 'password',
              placeholder: 'Confirm password',
            } as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
            slotAssignments: null,
          }),
          'btn-delete': new Box({
            type: NodeType.Element as NodeType.Element,
            id: 'btn-delete' as NodeId,
            parentId: 'actions' as NodeId,
            tagName: 'button',
            children: [] as NodeId[],
            attributes: {
              id: 'btn-delete',
              'aria-label': 'Delete Account',
              class: 'btn-danger',
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
      colorScheme: null,
    }
  }

  const events = [
    makePageTransitionEvent(500, 'https://app.example.com/settings/account'),
    makeSnapshotEvent(1000),
    // User types password confirmation
    makeKeyDownEvent(3500, 'p'),
    makeKeyDownEvent(3520, 'a'),
    makeKeyDownEvent(3540, 's'),
    makeKeyDownEvent(3560, 's'),
    makeKeyDownEvent(3580, 'w'),
    makeKeyDownEvent(3600, 'o'),
    makeKeyDownEvent(3620, 'r'),
    makeKeyDownEvent(3640, 'd'),
    makeClickEvent(4000, 'Delete Account', [400, 600], {
      id: 'btn-delete',
      tagName: 'button',
      attributes: { 'aria-label': 'Delete Account', class: 'btn-danger' },
    }),
    makeFetchRequestEvent(
      4100,
      'del-req-1',
      'https://app.example.com/api/account',
      'DELETE'
    ),
    makeFetchResponseEvent(4300, 'del-req-1', 403),
    // DOM changes: delete button removed, support link added in its place
    makeRemoveNodesPatchEvent(4400, 'actions', ['btn-delete']),
    makeAddNodesPatchEvent(4450, 'actions', ['lnk-support']),
  ]

  const accessor = makeAccessor(events, 8000, snapshotFn)

  return {
    name: 'user-action-triggered-network-error',
    prompt:
      "The delete account option isn't working. The user tried to delete their account but nothing happened. What went wrong?",
    expectedOutcomeDescription:
      'The agent identifies that the user typed a password confirmation and clicked "Delete Account" at ~4000ms, the DELETE /api/account request returned 403 Forbidden at ~4300ms, and the DOM changed immediately after — the delete button was removed and a "Contact support" link was added in its place — indicating the server rejected the deletion (likely due to insufficient permissions or a failed auth check). The agent should not conclude "nothing happened" — it should identify the 403 and the DOM change as evidence of the failure path being executed.',
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: 'EXTENSION_SYSTEM_CARD_MESSAGE',
  }
}
