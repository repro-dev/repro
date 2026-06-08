import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  ContentBlock,
  Entry,
  Hypothesis,
  RecordingMeta,
  ToolCall,
} from '../types'
import { buildCodingAgentExport } from './buildCodingAgentExport'

function makeAssistantEntry(
  id: string,
  content: string,
  toolCalls: Array<ToolCall> = []
): Entry {
  return { id, timestamp: new Date(), role: 'assistant', content, toolCalls }
}

function makeToolEntry(
  id: string,
  toolCallId: string,
  content: string | Array<ContentBlock>
): Entry {
  return {
    id,
    timestamp: new Date(),
    role: 'tool',
    content,
    tool_call_id: toolCallId,
  }
}

function makeUserEntry(id: string, content: string): Entry {
  return { id, timestamp: new Date(), role: 'user', content }
}

const meta: RecordingMeta = {
  browser: 'Chrome 120',
  durationMs: 45200,
  recordingUrl: 'https://app.repro.dev/r/abc123',
}

describe('buildCodingAgentExport', () => {
  it('produces valid markdown for an empty conversation', () => {
    const md = buildCodingAgentExport([], [], null)
    assert.ok(md.includes('# Agentic Debugging Context'))
    assert.ok(md.includes('**Duration:** Not available'))
    assert.ok(md.includes('No diagnosis reached'))
  })

  it('includes assistant content under root cause hypothesis', () => {
    const entries: Array<Entry> = [
      makeUserEntry('1', 'What is wrong?'),
      makeAssistantEntry('2', 'I found a bug in the login flow.'),
    ]
    const md = buildCodingAgentExport(entries, [], null)
    assert.ok(md.includes('I found a bug in the login flow.'))
  })

  it('extracts findErrors tool result', () => {
    const entries: Array<Entry> = [
      makeUserEntry('1', 'Find errors'),
      makeAssistantEntry('2', '', [
        {
          id: 'tc1',
          index: 0,
          function: { name: 'findErrors', arguments: '{}' },
        },
      ]),
      makeToolEntry(
        '3',
        'tc1',
        JSON.stringify({
          errors: [
            {
              message: 'TypeError: x is undefined',
              timestampMs: 1200,
              type: 'console',
            },
            {
              message: 'Failed to load resource',
              timestampMs: 3400,
              type: 'network',
            },
          ],
          summary: { console: 1, network: 1, total: 2 },
        })
      ),
    ]
    const md = buildCodingAgentExport(entries, [], null)
    assert.ok(md.includes('TypeError'))
    assert.ok(md.includes('x is undefined'))
    assert.ok(md.includes('Failed to load resource'))
    assert.ok(md.includes('findErrors'))
  })

  it('extracts console error messages', () => {
    const entries: Array<Entry> = [
      makeUserEntry('1', 'Check console'),
      makeAssistantEntry('2', '', [
        {
          id: 'tc1',
          index: 0,
          function: { name: 'getConsoleMessages', arguments: '{}' },
        },
      ]),
      makeToolEntry(
        '3',
        'tc1',
        JSON.stringify({
          messages: [
            { level: 'error', text: 'Uncaught TypeError', timestamp: 1000 },
            { level: 'error', text: 'Network error', timestamp: 2000 },
            { level: 'warn', text: 'Deprecated call', timestamp: 1500 },
          ],
        })
      ),
    ]
    const md = buildCodingAgentExport(entries, [], null)
    assert.ok(md.includes('Uncaught TypeError'))
    assert.ok(md.includes('Network error'))
    // Warning-level messages should not appear as evidence (they still appear
    // in Raw Tool Results which is the full tool output)
    const evidenceSection = md.match(/## Evidence\n\n([\s\S]*?)\n\n## Raw/)
    assert.ok(evidenceSection)
    assert.ok(!evidenceSection[1]!.includes('Deprecated call'))
  })

  it('extracts network request failures (4xx/5xx)', () => {
    const entries: Array<Entry> = [
      makeUserEntry('1', 'Check network'),
      makeAssistantEntry('2', '', [
        {
          id: 'tc1',
          index: 0,
          function: { name: 'getNetworkRequests', arguments: '{}' },
        },
      ]),
      makeToolEntry(
        '3',
        'tc1',
        JSON.stringify({
          requests: [
            {
              url: '/api/auth',
              status: 500,
              method: 'POST',
              timestampMs: 1000,
            },
            { url: '/api/data', status: 404, method: 'GET', timestampMs: 2000 },
            { url: '/api/ok', status: 200, method: 'GET', timestampMs: 3000 },
          ],
        })
      ),
    ]
    const md = buildCodingAgentExport(entries, [], null)
    // Evidence section should extract failed requests
    const evidenceSection = md.match(/## Evidence\n\n([\s\S]*?)\n\n## Raw/)
    assert.ok(evidenceSection)
    assert.ok(evidenceSection[1]!.includes('/api/auth'))
    assert.ok(evidenceSection[1]!.includes('/api/data'))
    // 200 responses should not appear in evidence (still appears in raw tool results)
    assert.ok(!evidenceSection[1]!.includes('/api/ok'))
    // URLs still appear in raw tool results section
    assert.ok(md.includes('/api/auth'))
    assert.ok(md.includes('/api/ok'))
  })

  it('includes DOM state info under evidence', () => {
    const entries: Array<Entry> = [
      makeUserEntry('1', 'Check DOM'),
      makeAssistantEntry('2', '', [
        {
          id: 'tc1',
          index: 0,
          function: { name: 'getDOMState', arguments: '{}' },
        },
      ]),
      makeToolEntry(
        '3',
        'tc1',
        JSON.stringify({
          mode: 'a11y',
          tree: { tagName: 'div', children: [] },
          timestampMs: 5000,
        })
      ),
    ]
    const md = buildCodingAgentExport(entries, [], null)
    assert.ok(md.includes('DOM state (a11y mode)'))
    assert.ok(md.includes('at 5000ms'))
  })

  it('renders hypotheses from conclusion', () => {
    const hypotheses: Array<Hypothesis> = [
      {
        id: 'h1',
        description: 'Network request to auth endpoint is failing silently',
        evidence: ['Request returned 500 at 3.2s', 'No retry logic detected'],
        confidence: 'high',
      },
      {
        id: 'h2',
        description: 'Form validation error',
        evidence: ['Missing required field'],
        confidence: 'medium',
      },
    ]
    const md = buildCodingAgentExport([], hypotheses, null)
    assert.ok(
      md.includes('Network request to auth endpoint is failing silently')
    )
    assert.ok(md.includes('Request returned 500 at 3.2s'))
    assert.ok(md.includes('high'))
    assert.ok(md.includes('Form validation error'))
    assert.ok(md.includes('medium'))
  })

  it('excludes captureScreenshot tool results', () => {
    const entries: Array<Entry> = [
      makeUserEntry('1', 'Take screenshot'),
      makeAssistantEntry('2', '', [
        {
          id: 'tc1',
          index: 0,
          function: { name: 'captureScreenshot', arguments: '{}' },
        },
      ]),
      makeToolEntry(
        '3',
        'tc1',
        JSON.stringify({ dataUrl: 'data:image/png;base64,abc123' })
      ),
      makeAssistantEntry('4', 'Screenshot taken'),
    ]
    const md = buildCodingAgentExport(entries, [], null)
    assert.ok(md.includes('Screenshot taken'))
    // The base64 string should not appear in the output
    assert.ok(!md.includes('base64,abc123'))
    assert.ok(!md.includes('captureScreenshot'))
  })

  it('handles null RecordingMeta', () => {
    const md = buildCodingAgentExport([], [], null)
    assert.ok(md.includes('**Duration:** Not available'))
    assert.ok(md.includes('**Browser:** Not available'))
  })

  it('handles full RecordingMeta', () => {
    const md = buildCodingAgentExport([], [], meta)
    assert.ok(md.includes('Chrome 120'))
    assert.ok(md.includes('45.2s'))
    assert.ok(md.includes('https://app.repro.dev/r/abc123'))
  })

  it('handles ContentBlock[] tool content', () => {
    const entries: Array<Entry> = [
      makeUserEntry('1', 'Screenshot'),
      makeAssistantEntry('2', '', [
        {
          id: 'tc1',
          index: 0,
          function: { name: 'captureScreenshot', arguments: '{}' },
        },
      ]),
      makeToolEntry('3', 'tc1', [
        { type: 'text', text: 'Screenshot captured' },
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,large' },
        },
      ]),
    ]
    // ContentBlock[] should be handled without crashing; captureScreenshot excluded
    const md = buildCodingAgentExport(entries, [], null)
    // captureScreenshot is excluded from output (no base64 bloat)
    assert.ok(!md.includes('base64,large'))
    // The assistant message content still appears
    assert.ok(md.includes('# Agentic Debugging Context'))
  })

  it('produces valid markdown with no assistant messages', () => {
    const entries: Array<Entry> = [makeUserEntry('1', 'Hello?')]
    const md = buildCodingAgentExport(entries, [], null)
    assert.ok(md.includes('# Agentic Debugging Context'))
    assert.ok(md.includes('No diagnosis reached'))
  })

  it('includes all tool results with correct tool names', () => {
    const entries: Array<Entry> = [
      makeUserEntry('1', 'Check both'),
      makeAssistantEntry('2', '', [
        {
          id: 'tc1',
          index: 0,
          function: { name: 'getRecordingDuration', arguments: '{}' },
        },
        {
          id: 'tc2',
          index: 1,
          function: { name: 'getConsoleMessages', arguments: '{}' },
        },
      ]),
      makeToolEntry('3', 'tc1', JSON.stringify({ durationMs: 10000 })),
      makeToolEntry(
        '4',
        'tc2',
        JSON.stringify({ messages: [{ level: 'error', text: 'err' }] })
      ),
    ]
    const md = buildCodingAgentExport(entries, [], null)
    assert.ok(md.includes('getRecordingDuration'))
    assert.ok(md.includes('getConsoleMessages'))
    assert.ok(md.includes('10000'))
    assert.ok(md.includes('err'))
  })

  it('does not exclude non-screenshot tool results with _tokenEstimate when toolName is unknown', () => {
    // Regression test: _tokenEstimate is present in every successful tool result
    // but is NOT a valid heuristic for identifying captureScreenshot results.
    // Only 'dataUrl' in data should mark a result as a screenshot.
    const entries: Array<Entry> = [
      makeUserEntry('1', 'Check duration'),
      makeAssistantEntry('2', '', [
        {
          id: 'tc1',
          index: 0,
          function: { name: 'getRecordingDuration', arguments: '{}' },
        },
      ]),
      // Tool entry whose assistant match is absent, causing toolName to fall back to 'unknown'
      makeToolEntry(
        '3',
        'nonexistent-call-id',
        JSON.stringify({ durationMs: 10000, _tokenEstimate: 50 })
      ),
    ]
    const md = buildCodingAgentExport(entries, [], null)
    // The tool result should appear in Raw Tool Results despite having _tokenEstimate
    assert.ok(md.includes('10000'))
  })

  it('includes a prompt preamble at the end', () => {
    const entries: Array<Entry> = [
      makeUserEntry('1', 'What is wrong?'),
      makeAssistantEntry('2', 'Bug found.'),
    ]
    const md = buildCodingAgentExport(entries, [], meta)
    assert.ok(
      md.includes(
        'Repro found the following issues in this recording. Please investigate the codebase and fix the root cause.'
      )
    )
  })
})
