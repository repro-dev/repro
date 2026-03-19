export function summarizeToolResult(toolName: string, content: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return 'Completed'
  }

  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    'error' in parsed &&
    typeof (parsed as Record<string, unknown>).error === 'string'
  ) {
    return `Error: ${(parsed as Record<string, unknown>).error}`
  }

  if (toolName === 'getRecordingDuration') {
    const data = parsed as Record<string, unknown>
    if ('duration' in data) {
      return `Duration: ${data.duration}s`
    }
    return 'Completed'
  }

  if (toolName === 'getConsoleMessages') {
    const data = parsed as Record<string, unknown>
    if ('messages' in data && Array.isArray(data.messages)) {
      return `Found ${data.messages.length} message(s)`
    }
    return 'Completed'
  }

  if (toolName === 'getNetworkRequests') {
    const data = parsed as Record<string, unknown>
    if ('requests' in data && Array.isArray(data.requests)) {
      return `Found ${data.requests.length} request(s)`
    }
    return 'Completed'
  }

  return 'Completed'
}
