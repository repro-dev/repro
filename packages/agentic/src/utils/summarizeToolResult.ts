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
    if ('durationMs' in data && typeof data.durationMs === 'number') {
      return `Duration: ${(data.durationMs / 1000).toFixed(1)}s`
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

  if (toolName === 'getConsoleContext') {
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

  if (toolName === 'getDOMState') {
    const data = parsed as Record<string, unknown>
    if ('timestampMs' in data && typeof data.timestampMs === 'number') {
      return `DOM state at ${data.timestampMs}ms`
    }
    return 'Completed'
  }

  if (toolName === 'findErrors') {
    const data = parsed as Record<string, unknown>
    if ('errors' in data && Array.isArray(data.errors)) {
      return `Found ${data.errors.length} error(s)`
    }
    return 'Completed'
  }

  if (toolName === 'getElementDetails') {
    const data = parsed as Record<string, unknown>
    const element = data.element as Record<string, unknown> | undefined
    if (element && typeof element.tagName === 'string') {
      return `Element details: ${element.tagName}`
    }
    return 'Completed'
  }

  if (toolName === 'getEvents') {
    const data = parsed as Record<string, unknown>
    if ('events' in data && Array.isArray(data.events)) {
      return `Found ${data.events.length} event(s)`
    }
    return 'Completed'
  }

  if (toolName === 'captureScreenshot') {
    return 'Screenshot captured'
  }

  if (toolName === 'getEventsAroundTime') {
    const data = parsed as Record<string, unknown>
    if (
      'events' in data &&
      Array.isArray(data.events) &&
      'centerMs' in data &&
      typeof data.centerMs === 'number'
    ) {
      return `Found ${data.events.length} event(s) around ${data.centerMs}ms`
    }
    return 'Completed'
  }

  return 'Completed'
}
