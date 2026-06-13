import type { Entry, Hypothesis, RecordingMeta } from '../types'

function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}m ${seconds}s`
}

export async function buildCodingAgentExport(
  _entries: Array<Entry>,
  _hypotheses: Array<Hypothesis>,
  meta: RecordingMeta | null
): Promise<string> {
  const lines: Array<string> = []

  lines.push('# Agentic Debugging Context\n')
  lines.push('## Recording Info\n')
  lines.push(`- **URL:** ${meta?.recordingUrl ?? 'Not available'}`)
  lines.push(
    `- **Duration:** ${
      meta?.durationMs != null
        ? formatDuration(meta.durationMs)
        : 'Not available'
    }`
  )
  lines.push(`- **Browser:** ${meta?.browser ?? 'Not available'}\n`)
  lines.push(
    'Full investigation context will be generated here from the conversation history.\n'
  )

  return lines.join('\n')
}
