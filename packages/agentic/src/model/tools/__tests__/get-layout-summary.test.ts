import { NodeType, Snapshot } from '@repro/domain'
import { Box } from '@repro/tdl'
import { SCREENSHOT_TOKEN_EQUIVALENT } from '@repro/vdom-utils'
import { resolve } from 'fluture'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { RecordingDataAccessor } from '../../../types'
import {
  handler as getLayoutSummary,
  TOOL_DEFINITION as getLayoutSummaryDef,
} from '../get-layout-summary'
import { runFuture } from './helpers'

// ─── Snapshot factory ───────────────────────────────────────────────────────

function makeElement(
  id: string,
  tagName: string,
  children: string[] = [],
  attributes: Record<string, string | null> = {}
) {
  return new Box({
    type: NodeType.Element as NodeType.Element,
    id,
    parentId: null,
    tagName,
    children,
    attributes,
    properties: {
      value: null,
      checked: null,
      selectedIndex: null,
    },
    shadowRoot: false,
    slotAssignments: null,
  })
}

function makeText(id: string, value: string) {
  return new Box({
    type: NodeType.Text as NodeType.Text,
    id,
    parentId: null,
    value,
  })
}

function makeDocument(id: string, children: string[]) {
  return new Box({
    type: NodeType.Document as NodeType.Document,
    id,
    parentId: null,
    children,
  })
}

function makeLayoutSnapshot(): Snapshot {
  return {
    dom: {
      rootId: 'root',
      nodes: {
        root: makeDocument('root', ['hdr', 'main']),
        hdr: makeElement('hdr', 'header', [], {
          'aria-label': 'Dashboard',
        }),
        main: makeElement('main', 'main', ['btn']),
        btn: makeElement('btn', 'button', ['txt'], {
          type: 'submit',
        }),
        txt: makeText('txt', 'Submit'),
      },
    },
    interaction: {
      pointer: [0, 0] as [number, number],
      pointerState: 0 as unknown as never,
      scroll: {} as never,
      viewport: [1440, 900] as [number, number],
      pageURL: 'https://example.com',
    },
    frameworkState: null,
    cssRules: null,
    colorScheme: null,
  }
}

function makeAccessor(
  snapshotFn?: (ts: number) => Snapshot | null
): RecordingDataAccessor {
  return {
    getDuration: () => 60000,
    getSnapshotAtTime: (timestampMs: number) =>
      resolve(snapshotFn ? snapshotFn(timestampMs) : null),
    getResourceMap: () => resolve({}),
    getEventsByType: () => resolve([]),
    getEventsInRange: () => resolve([]),
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('getLayoutSummary — tool handler', () => {
  // Test 11: Success path
  it('returns formatted layout summary with _tokenEstimate on success', async () => {
    const accessor = makeAccessor(() => makeLayoutSnapshot())
    const result = await runFuture(
      getLayoutSummary(accessor, { timestampMs: 1000 })
    )
    const r = result as Record<string, unknown>

    assert.ok(typeof r.layout === 'string')
    assert.ok((r.layout as string).includes('LAYOUT SUMMARY'))
    assert.strictEqual(r.timestampMs, 1000)
    assert.ok(typeof r._tokenEstimate === 'number')
    assert.ok((r._tokenEstimate as number) > 0)
  })

  // Test 12: Detail level arg
  it('threads detail parameter through to builder', async () => {
    const accessor = makeAccessor(() => makeLayoutSnapshot())
    const resultOverview = await runFuture(
      getLayoutSummary(accessor, { timestampMs: 1000, detail: 'overview' })
    )
    const resultDetailed = await runFuture(
      getLayoutSummary(accessor, { timestampMs: 1000, detail: 'detailed' })
    )
    const rO = resultOverview as Record<string, unknown>
    const rD = resultDetailed as Record<string, unknown>

    assert.strictEqual(rO.detail, 'overview')
    assert.strictEqual(rD.detail, 'detailed')
    // Overview should be shorter or equal to detailed
    assert.ok((rO.layout as string).length <= (rD.layout as string).length)
  })

  // Test 13: No snapshot at timestamp
  it('returns createError shape when no snapshot at timestamp', async () => {
    const accessor = makeAccessor(() => null)
    const result = await runFuture(
      getLayoutSummary(accessor, { timestampMs: 99999 })
    )
    const r = result as Record<string, unknown>

    assert.ok('error' in r)
    assert.ok(typeof r.error === 'string')
    // Should follow the agentic error contract:
    // (1) what failed, (2) why, (3) recovery suggestion
    assert.ok(typeof r.reason === 'string')
    assert.ok(typeof r.suggestion === 'string')
    assert.ok(
      (r.suggestion as string).toLowerCase().includes('duration'),
      `Expected suggestion mentioning getRecordingDuration, got: ${r.suggestion}`
    )
    assert.ok(typeof r._tokenEstimate === 'number')
  })

  // Test 14: Token efficiency — smaller than screenshot
  it('_tokenEstimate is below SCREENSHOT_TOKEN_EQUIVALENT', async () => {
    const accessor = makeAccessor(() => makeLayoutSnapshot())
    const result = await runFuture(
      getLayoutSummary(accessor, { timestampMs: 1000 })
    )
    const r = result as Record<string, unknown>
    assert.ok(
      (r._tokenEstimate as number) < SCREENSHOT_TOKEN_EQUIVALENT,
      `_tokenEstimate ${r._tokenEstimate} should be < ${SCREENSHOT_TOKEN_EQUIVALENT}`
    )
  })
})

describe('getLayoutSummary — registration', () => {
  // Test 15a: Tool definition has correct name
  it('has correct function name', () => {
    assert.strictEqual(getLayoutSummaryDef.function.name, 'getLayoutSummary')
  })

  // Test 15b: Registered in tools array and toolHandlers
  it('is registered in the tools index', async () => {
    const { tools, extensionTools } = await import('../index')
    const toolNames = tools.map(
      (t: { function: { name: string } }) => t.function.name
    )
    assert.ok(
      toolNames.includes('getLayoutSummary'),
      `Expected getLayoutSummary in tools: ${toolNames}`
    )

    // Should be in extensionTools (captureScreenshot and askUser are excluded; this is not)
    const extNames = extensionTools.map(
      (t: { function: { name: string } }) => t.function.name
    )
    assert.ok(
      extNames.includes('getLayoutSummary'),
      `Expected getLayoutSummary in extensionTools: ${extNames}`
    )
  })
})
