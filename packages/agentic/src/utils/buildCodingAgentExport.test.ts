import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Entry, Hypothesis, RecordingMeta } from '../types'
import { buildCodingAgentExport } from './buildCodingAgentExport'

function makeAssistantEntry(id: string, content: string): Entry {
  return {
    id,
    timestamp: new Date(),
    role: 'assistant',
    content,
    toolCalls: [],
  }
}

function makeUserEntry(id: string, content: string): Entry {
  return { id, timestamp: new Date(), role: 'user', content }
}

const noEntries: Array<Entry> = []
const noHypotheses: Array<Hypothesis> = []

describe('buildCodingAgentExport', () => {
  it('produces valid markdown for an empty conversation', async () => {
    const result = await buildCodingAgentExport(noEntries, noHypotheses, null)
    assert.ok(result.includes('# Agentic Debugging Context'))
    assert.ok(result.includes('## Recording Info'))
    assert.ok(result.includes('Not available'))
  })

  it('includes full RecordingMeta fields', async () => {
    const meta: RecordingMeta = {
      browser: 'Chrome 120',
      durationMs: 45200,
      recordingUrl: 'https://app.repro.dev/r/abc123',
    }
    const result = await buildCodingAgentExport(noEntries, noHypotheses, meta)
    assert.ok(result.includes('https://app.repro.dev/r/abc123'))
    assert.ok(result.includes('45.2s'))
    assert.ok(result.includes('Chrome 120'))
  })

  it('handles null RecordingMeta gracefully', async () => {
    const result = await buildCodingAgentExport(noEntries, noHypotheses, null)
    assert.ok(result.includes('Not available'))
    assert.ok(result.includes('Full investigation context will be generated'))
  })

  it('produces valid markdown with conversation entries', async () => {
    const entries: Array<Entry> = [
      makeUserEntry('1', 'There is a bug on the login page'),
      makeAssistantEntry('2', 'I found the issue. The submit handler'),
    ]
    const result = await buildCodingAgentExport(entries, noHypotheses, null)
    assert.ok(result.includes('Full investigation context will be generated'))
  })

  it('formats duration under 60s correctly', async () => {
    const meta: RecordingMeta = {
      durationMs: 5200,
      browser: null,
      recordingUrl: null,
    }
    const result = await buildCodingAgentExport(noEntries, noHypotheses, meta)
    assert.ok(result.includes('5.2s'))
  })

  it('formats duration over 60s correctly', async () => {
    const meta: RecordingMeta = {
      durationMs: 125000,
      browser: null,
      recordingUrl: null,
    }
    const result = await buildCodingAgentExport(noEntries, noHypotheses, meta)
    assert.ok(result.includes('2m'))
  })
})
