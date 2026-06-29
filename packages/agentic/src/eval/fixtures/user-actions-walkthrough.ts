import { NodeId, NodeType, Snapshot } from '@repro/domain'
import { Box } from '@repro/tdl'
import { EXTENSION_SYSTEM_CARD_MESSAGE } from '../../model/system'
import {
  makeAccessor,
  makeClickEvent,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makeKeyDownEvent,
  makePageTransitionEvent,
  makeScrollEvent,
  makeSnapshotEvent,
} from '../../model/tools/__tests__/helpers'
import { EvalFixture } from '../runner'

// Fixture: a multi-step e-commerce session with no errors.
// The user navigates to /products, scrolls, types a search query, clicks
// Search, navigates to a product detail page, and clicks Add to Cart.
// Exercises: getUserActions
export function createFixture(): EvalFixture {
  // Two DOM states: search page (t >= 1000) and product detail page (t >= 3200)
  function snapshotFn(timestampMs: number): Snapshot | null {
    if (timestampMs < 1000) {
      return null
    }

    if (timestampMs >= 3200) {
      // Product detail page: product div + Add to Cart button
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
              children: ['prod01'] as NodeId[],
              attributes: {} as Record<string, string | null>,
              properties: { value: null, checked: null, selectedIndex: null },
              shadowRoot: false,
              slotAssignments: null,
            }),
            prod01: new Box({
              type: NodeType.Element as NodeType.Element,
              id: 'prod01' as NodeId,
              parentId: 'body' as NodeId,
              tagName: 'div',
              children: ['btn-add-cart'] as NodeId[],
              attributes: {
                id: 'prod01',
                class: 'product-detail',
              } as Record<string, string | null>,
              properties: { value: null, checked: null, selectedIndex: null },
              shadowRoot: false,
              slotAssignments: null,
            }),
            'btn-add-cart': new Box({
              type: NodeType.Element as NodeType.Element,
              id: 'btn-add-cart' as NodeId,
              parentId: 'prod01' as NodeId,
              tagName: 'button',
              children: [] as NodeId[],
              attributes: {
                id: 'btn-add-cart',
                'aria-label': 'Add to Cart',
                'data-product-id': '42',
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

    // Search/products page: form with search input and search button
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
            children: ['form01'] as NodeId[],
            attributes: {} as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
            slotAssignments: null,
          }),
          form01: new Box({
            type: NodeType.Element as NodeType.Element,
            id: 'form01' as NodeId,
            parentId: 'body' as NodeId,
            tagName: 'form',
            children: ['inp01', 'btn-search'] as NodeId[],
            attributes: {} as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
            slotAssignments: null,
          }),
          inp01: new Box({
            type: NodeType.Element as NodeType.Element,
            id: 'inp01' as NodeId,
            parentId: 'form01' as NodeId,
            tagName: 'input',
            children: [] as NodeId[],
            attributes: {
              id: 'inp01',
              type: 'search',
              placeholder: 'Search products…',
            } as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
            slotAssignments: null,
          }),
          'btn-search': new Box({
            type: NodeType.Element as NodeType.Element,
            id: 'btn-search' as NodeId,
            parentId: 'form01' as NodeId,
            tagName: 'button',
            children: [] as NodeId[],
            attributes: {
              id: 'btn-search',
              'aria-label': 'Search',
              type: 'submit',
            } as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
            slotAssignments: null,
          }),
        },
      },
      colorScheme: null,
      interaction: null,
      frameworkState: null,
      cssRules: null,
    }
  }

  const events = [
    makePageTransitionEvent(500, 'https://shop.example.com/products'),
    makeSnapshotEvent(1000),
    makeScrollEvent(1200, 'body' as NodeId, [0, 0], [0, 400]),
    // User types "blue running shoes" into the search field
    makeKeyDownEvent(1800, 'b'),
    makeKeyDownEvent(1850, 'l'),
    makeKeyDownEvent(1900, 'u'),
    makeKeyDownEvent(1950, 'e'),
    makeKeyDownEvent(2000, ' '),
    makeKeyDownEvent(2050, 'r'),
    makeKeyDownEvent(2100, 'u'),
    makeKeyDownEvent(2150, 'n'),
    makeKeyDownEvent(2200, 'n'),
    makeKeyDownEvent(2250, 'i'),
    makeKeyDownEvent(2300, 'n'),
    makeKeyDownEvent(2350, 'g'),
    makeKeyDownEvent(2400, ' '),
    makeKeyDownEvent(2450, 's'),
    makeKeyDownEvent(2500, 'h'),
    makeKeyDownEvent(2550, 'o'),
    makeKeyDownEvent(2600, 'e'),
    makeKeyDownEvent(2650, 's'),
    makeClickEvent(2700, 'Search', [200, 60], {
      id: 'btn-search',
      tagName: 'button',
      attributes: { 'aria-label': 'Search', type: 'submit' },
    }),
    makePageTransitionEvent(
      3000,
      'https://shop.example.com/products/42',
      'https://shop.example.com/products'
    ),
    makeSnapshotEvent(3200),
    makeClickEvent(3400, 'Add to Cart', [300, 500], {
      id: 'btn-add-cart',
      tagName: 'button',
      attributes: { 'aria-label': 'Add to Cart', 'data-product-id': '42' },
    }),
    makeFetchRequestEvent(
      3500,
      'cart-req-1',
      'https://shop.example.com/api/cart',
      'POST'
    ),
    makeFetchResponseEvent(3600, 'cart-req-1', 200),
  ]

  const accessor = makeAccessor(events, 6000, snapshotFn)

  return {
    name: 'user-actions-walkthrough',
    prompt: 'Walk me through what the user did in this session.',
    expectedOutcomeDescription:
      "The agent calls getUserActions and narrates the full session: the user navigated to /products, scrolled down, typed a search query ('blue running shoes') key by key, clicked the Search button (aria-label: Search, type: submit), navigated to /products/42, clicked the Add to Cart button (aria-label: Add to Cart, data-product-id: 42), and a POST to /api/cart returned 200. No errors occurred.",
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: 'EXTENSION_SYSTEM_CARD_MESSAGE',
  }
}
