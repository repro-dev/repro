import { NodeId, NodeType, Snapshot, VNode } from '@repro/domain'
import { Box } from '@repro/tdl'
import { WORKSPACE_SYSTEM_CARD_MESSAGE } from '../../model/system'
import {
  makeAccessor,
  makeAddNodesPatchEvent,
  makeClickEvent,
  makeConsoleErrorEvent,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makePageTransitionEvent,
  makeSnapshotEvent,
} from '../../model/tools/__tests__/helpers'
import { EvalFixture } from '../runner'

// Fixture: user clicks "Submit Payment". The POST /api/payments request returns
// 500. Immediately after, an error banner node is added to the DOM. A console
// error fires at the same time. The agent must take the Error path, but should
// also use getDOMDiff to observe the UI reaction (error banner appearing).
// Exercises: findErrors (error path), getDOMDiff (domActivity exception)
export function createFixture(): EvalFixture {
  // Snapshot states:
  //   [1000, 3600) → checkout page, no error banner
  //   [3600, ∞)    → checkout page with error-banner node added
  function snapshotFn(timestampMs: number): Snapshot | null {
    if (timestampMs < 1000) {
      return null
    }

    const hasErrorBanner = timestampMs >= 3600

    const children = hasErrorBanner
      ? (['checkout-form', 'error-banner'] as NodeId[])
      : (['checkout-form'] as NodeId[])

    const nodes: Record<string, VNode> = {
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
        children: ['checkout-form'] as NodeId[],
        attributes: {} as Record<string, string | null>,
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      }),
      'checkout-form': new Box({
        type: NodeType.Element as NodeType.Element,
        id: 'checkout-form' as NodeId,
        parentId: 'body' as NodeId,
        tagName: 'form',
        children: ['btn-submit'] as NodeId[],
        attributes: { id: 'checkout-form' } as Record<string, string | null>,
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      }),
      'btn-submit': new Box({
        type: NodeType.Element as NodeType.Element,
        id: 'btn-submit' as NodeId,
        parentId: 'checkout-form' as NodeId,
        tagName: 'button',
        children: [] as NodeId[],
        attributes: {
          id: 'btn-submit',
          'aria-label': 'Submit Payment',
          type: 'submit',
        } as Record<string, string | null>,
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      }),
    }

    if (hasErrorBanner) {
      nodes['body'] = new Box({
        type: NodeType.Element as NodeType.Element,
        id: 'body' as NodeId,
        parentId: 'root' as NodeId,
        tagName: 'body',
        children,
        attributes: {} as Record<string, string | null>,
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      })
      nodes['error-banner'] = new Box({
        type: NodeType.Element as NodeType.Element,
        id: 'error-banner' as NodeId,
        parentId: 'body' as NodeId,
        tagName: 'div',
        children: [] as NodeId[],
        attributes: {
          id: 'error-banner',
          role: 'alert',
          class: 'error-banner',
          'data-message': 'Payment failed. Please try again.',
        } as Record<string, string | null>,
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      })
    }

    return {
      dom: {
        rootId: 'root',
        nodes: nodes as Record<NodeId, VNode>,
      },
      interaction: null,
      frameworkState: null,
    }
  }

  const events = [
    makePageTransitionEvent(500, 'https://app.example.com/checkout'),
    makeSnapshotEvent(1000),
    makeClickEvent(3000, 'Submit Payment', [400, 500], {
      id: 'btn-submit',
      tagName: 'button',
      attributes: { 'aria-label': 'Submit Payment', type: 'submit' },
    }),
    makeFetchRequestEvent(
      3100,
      'pay-req-1',
      'https://app.example.com/api/payments',
      'POST'
    ),
    makeFetchResponseEvent(3500, 'pay-req-1', 500),
    makeConsoleErrorEvent(
      3520,
      'Payment processing failed: Internal server error',
      [
        {
          functionName: 'handlePaymentResponse',
          fileName: 'checkout.js',
          lineNumber: 142,
          columnNumber: 12,
        },
      ]
    ),
    // DOM change: error banner added immediately after the 500 response
    makeAddNodesPatchEvent(3600, 'body', ['error-banner']),
  ]

  const accessor = makeAccessor(events, 6000, snapshotFn)

  return {
    name: 'error-with-dom-side-effect',
    prompt:
      'Something went wrong after I clicked Submit Payment. The page looked different after that. What happened?',
    expectedOutcomeDescription:
      'The agent identifies that clicking "Submit Payment" at ~3000ms triggered a POST /api/payments request that returned 500 Internal Server Error at ~3500ms, followed by a console error "Payment processing failed: Internal server error" from checkout.js line 142. The agent should also note that the DOM changed immediately after the error — an error banner element (div#error-banner with role="alert" and message "Payment failed. Please try again.") was added to the body at ~3600ms, confirming the UI correctly surfaced the payment failure to the user. The root cause is a server-side payment processing failure.',
    accessor,
    systemPrompt: WORKSPACE_SYSTEM_CARD_MESSAGE,
    promptExportName: 'WORKSPACE_SYSTEM_CARD_MESSAGE',
  }
}
