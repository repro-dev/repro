interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters?: object
  }
}

const GET_RECORDING_DURATION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'getRecordingDuration',
    description: 'Get the duration of the recording.',
  },
}

const GET_CONSOLE_MESSAGES: ToolDefinition = {
  type: 'function',
  function: {
    name: 'getConsoleMessages',
    description:
      'Get recorded console messages, with an optional minimum log level and time range.',
    parameters: {
      type: 'object',
      properties: {
        logLevel: {
          type: 'string',
          enum: ['verbose', 'info', 'warning', 'error'],
          default: 'info',
          description: 'The minimum level of logs to include.',
        },
        timeRangeStartMs: {
          type: 'number',
          description:
            'The start of the time range for returned log messages. If omitted, this will default to the start of the recording.',
        },
        timeRangeEndMs: {
          type: 'number',
          description:
            'The end of the time range for returned log messages. If omitted, this will default to the end of the recording.',
        },
      },
    },
  },
}

export const tools: Array<ToolDefinition> = [
  GET_RECORDING_DURATION,
  GET_CONSOLE_MESSAGES,
]

const toolHandlers: Record<
  string,
  (args: Record<string, unknown>) => unknown
> = {
  getRecordingDuration: () => ({ durationMs: 0 }),
  getConsoleMessages: () => ({ messages: [] }),
}

export function executeTool(
  name: string,
  args: Record<string, unknown>
): unknown {
  const handler = toolHandlers[name]

  if (!handler) {
    return { error: `Unknown tool: ${name}` }
  }

  return handler(args)
}
