import { sortHypothesesByConfidence } from '../investigationStage'
import type {
  ContentBlock,
  Entry,
  Hypothesis,
  RecordingMeta,
  ToolMessage,
} from '../types'

/**
 * Format milliseconds into a human-readable duration string (e.g. "45.2s").
 * Inlined to avoid a cross-package dependency on @repro/agentic-ui's formatTimeMs.
 */
function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}m ${seconds}s`
}

/** Parse JSON tool result content safely. */
function tryParseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

/** Extract tool result text from a ToolMessage, handling both string and ContentBlock[]. */
function getToolResultText(toolMessage: ToolMessage): string {
  if (typeof toolMessage.content === 'string') {
    return toolMessage.content
  }
  // ContentBlock[] — extract text blocks only, skip image_url blocks
  return toolMessage.content
    .filter(
      (block: ContentBlock): block is { type: 'text'; text: string } =>
        block.type === 'text'
    )
    .map(block => block.text)
    .join('\n')
}

/** Extract console error messages from a tool result. */
function findConsoleErrors(content: string): Array<string> {
  const parsed = tryParseJson(content)
  if (!parsed || typeof parsed !== 'object') return []

  const data = parsed as Record<string, unknown>

  // getConsoleMessages
  if ('messages' in data && Array.isArray(data.messages)) {
    return data.messages
      .filter(
        (m: unknown) =>
          typeof m === 'object' &&
          m !== null &&
          (m as Record<string, unknown>).level === 'error'
      )
      .map((m: unknown) => {
        const msg = m as Record<string, unknown>
        const text =
          typeof msg.text === 'string' ? msg.text : String(msg.text ?? '')
        const ts =
          typeof msg.timestamp === 'number' ? ` [${msg.timestamp}ms]` : ''
        return `${text}${ts}`
      })
  }

  return []
}

/** Extract failed network requests (4xx/5xx) from a tool result. */
function findNetworkErrors(content: string): Array<string> {
  const parsed = tryParseJson(content)
  if (!parsed || typeof parsed !== 'object') return []

  const data = parsed as Record<string, unknown>

  if ('requests' in data && Array.isArray(data.requests)) {
    return data.requests
      .filter((r: unknown) => {
        if (typeof r !== 'object' || r === null) return false
        const req = r as Record<string, unknown>
        return typeof req.status === 'number' && req.status >= 400
      })
      .map((r: unknown) => {
        const req = r as Record<string, unknown>
        const url =
          typeof req.url === 'string' ? req.url : String(req.url ?? '')
        const status = req.status
        const method = typeof req.method === 'string' ? req.method : 'GET'
        const ts =
          typeof req.timestampMs === 'number' ? ` [${req.timestampMs}ms]` : ''
        return `${method} ${url} → ${status}${ts}`
      })
  }

  return []
}

/** Extract DOM state summary from a tool result. */
function findDOMState(content: string): string | null {
  const parsed = tryParseJson(content)
  if (!parsed || typeof parsed !== 'object') return null

  const data = parsed as Record<string, unknown>

  if ('mode' in data && typeof data.mode === 'string') {
    const ts =
      'timestampMs' in data && typeof data.timestampMs === 'number'
        ? ` at ${data.timestampMs}ms`
        : ''
    return `DOM state (${data.mode} mode)${ts}`
  }

  return null
}

/** Check if a tool result is a captureScreenshot result. */
function isScreenshotTool(content: string): boolean {
  const parsed = tryParseJson(content)
  if (!parsed || typeof parsed !== 'object') return false

  const data = parsed as Record<string, unknown>
  return 'dataUrl' in data
}

/**
 * Build a self-contained markdown document from the agentic conversation
 * entries, hypotheses, and optional recording metadata.
 */
export function buildCodingAgentExport(
  entries: Array<Entry>,
  hypotheses: Array<Hypothesis>,
  meta: RecordingMeta | null
): string {
  const sections: Array<string> = []

  // ── Header ──────────────────────────────────────────────────────────
  sections.push('# Agentic Debugging Context\n')

  sections.push('## Recording Info\n')
  sections.push(`- **URL:** ${meta?.recordingUrl ?? 'Not available'}`)
  sections.push(
    `- **Duration:** ${
      meta?.durationMs != null
        ? formatDuration(meta.durationMs)
        : 'Not available'
    }`
  )
  sections.push(`- **Browser:** ${meta?.browser ?? 'Not available'}\n`)

  // ── Root Cause Hypothesis ──────────────────────────────────────────
  sections.push('## Root Cause Hypothesis\n')

  const sortedHypotheses = sortHypothesesByConfidence(hypotheses)

  if (sortedHypotheses.length > 0) {
    for (const h of sortedHypotheses) {
      sections.push(`### ${h.description} (confidence: ${h.confidence})\n`)
      if (h.evidence.length > 0) {
        for (const ev of h.evidence) {
          sections.push(`- ${ev}`)
        }
        sections.push('')
      }
    }
  } else {
    // Fall back to the last assistant message text
    const assistantMessages = entries.filter(e => e.role === 'assistant')
    const lastAssistant = assistantMessages[assistantMessages.length - 1]

    if (lastAssistant && lastAssistant.role === 'assistant') {
      sections.push(lastAssistant.content)
      sections.push('')
    } else {
      sections.push('No diagnosis reached.\n')
    }
  }

  // ── Evidence ────────────────────────────────────────────────────────
  sections.push('## Evidence\n')

  const evidenceLines: Array<string> = []

  for (const entry of entries) {
    if (entry.role !== 'tool') continue

    const content = getToolResultText(entry)

    // Find which assistant tool call this belongs to
    const assistantEntry = entries.find(
      (
        e
      ): e is {
        role: 'assistant'
        toolCalls: Array<{ id: string; function: { name: string } }>
      } & Entry =>
        e.role === 'assistant' &&
        'toolCalls' in e &&
        Array.isArray(e.toolCalls) &&
        e.toolCalls.some((tc: { id: string }) => tc.id === entry.tool_call_id)
    )
    const toolName =
      assistantEntry?.toolCalls.find(
        (tc: { id: string }) => tc.id === entry.tool_call_id
      )?.function?.name ?? 'unknown'

    // Extract evidence based on tool type
    if (toolName === 'getConsoleMessages') {
      const errors = findConsoleErrors(content)
      for (const err of errors) {
        evidenceLines.push(`- [Console Error] ${err}`)
      }
    } else if (toolName === 'getNetworkRequests') {
      const errors = findNetworkErrors(content)
      for (const err of errors) {
        evidenceLines.push(`- [Network Error] ${err}`)
      }
    } else if (toolName === 'findErrors') {
      const parsed = tryParseJson(content)
      if (parsed && typeof parsed === 'object') {
        const data = parsed as Record<string, unknown>
        if ('errors' in data && Array.isArray(data.errors)) {
          for (const err of data.errors) {
            if (typeof err === 'object' && err !== null) {
              const e = err as Record<string, unknown>
              const msg =
                typeof e.message === 'string'
                  ? e.message
                  : String(e.message ?? '')
              const ts =
                typeof e.timestampMs === 'number' ? ` [${e.timestampMs}ms]` : ''
              const type = typeof e.type === 'string' ? ` (${e.type})` : ''
              evidenceLines.push(`- [Error${type}] ${msg}${ts}`)
            }
          }
        }
      }
    } else if (toolName === 'getDOMState') {
      const domInfo = findDOMState(content)
      if (domInfo) {
        evidenceLines.push(`- ${domInfo}`)
      }
    }
  }

  if (evidenceLines.length > 0) {
    sections.push(evidenceLines.join('\n'))
    sections.push('')
  } else {
    sections.push('No evidence items extracted.\n')
  }

  // ── Raw Tool Results ────────────────────────────────────────────────
  sections.push('## Raw Tool Results\n')

  const assistantMessages = entries.filter(e => e.role === 'assistant')
  const toolResults: Array<{ toolName: string; content: string }> = []

  for (const entry of entries) {
    if (entry.role !== 'tool') continue

    const content = getToolResultText(entry)

    const assistantEntry = assistantMessages.find(
      (
        e
      ): e is {
        role: 'assistant'
        toolCalls: Array<{ id: string; function: { name: string } }>
      } & Entry =>
        e.role === 'assistant' &&
        'toolCalls' in e &&
        Array.isArray(e.toolCalls) &&
        e.toolCalls.some((tc: { id: string }) => tc.id === entry.tool_call_id)
    )
    const toolName =
      assistantEntry?.toolCalls.find(
        (tc: { id: string }) => tc.id === entry.tool_call_id
      )?.function?.name ?? 'unknown'

    // Skip screenshot results (base64 bloat)
    if (toolName === 'captureScreenshot') continue
    if (toolName === 'unknown' && isScreenshotTool(content)) continue

    toolResults.push({ toolName, content })
  }

  if (toolResults.length > 0) {
    for (const tr of toolResults) {
      // Truncate very long results to avoid bloat
      const displayContent =
        tr.content.length > 2000
          ? tr.content.slice(0, 2000) + '\n\n... (truncated)'
          : tr.content

      sections.push(`<details>\n<summary>${tr.toolName}</summary>\n\n`)
      sections.push('```json')
      sections.push(displayContent)
      sections.push('```')
      sections.push(`\n</details>\n`)
    }
  } else {
    sections.push('No raw tool results to display.\n')
  }

  // ── Suggested Prompt Preamble ──────────────────────────────────────
  sections.push('## Suggested Prompt\n')
  sections.push(
    `You are a debugging assistant. Use the information below to investigate and resolve the reported issue.

To reproduce this bug:
1. Open the recording in Repro
2. Follow the evidence timeline above
3. Apply the suggested fix based on root cause analysis`
  )
  sections.push('')

  return sections.join('\n')
}
