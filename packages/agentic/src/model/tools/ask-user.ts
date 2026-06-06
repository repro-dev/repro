import { resolve } from 'fluture'
import type { ToolHandler } from './common'
import { createError } from './common'

type AskUserArgs = {
  prompt?: unknown
  choices?: unknown
  multiple?: unknown
  allowFreeform?: unknown
}

function parseArgs(args: Record<string, unknown>) {
  const parsed = args as AskUserArgs
  const prompt = parsed.prompt

  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return {
      error: createError(
        'Invalid askUser prompt',
        'The prompt must be a non-empty string',
        'Call askUser with a `prompt` string and optionally include `choices`, `multiple`, or `allowFreeform`.'
      ),
    }
  }

  const choices = Array.isArray(parsed.choices)
    ? parsed.choices.filter(
        (
          choice
        ): choice is { label: string; value: string; description?: string } =>
          choice !== null &&
          typeof choice === 'object' &&
          typeof (choice as Record<string, unknown>).label === 'string' &&
          typeof (choice as Record<string, unknown>).value === 'string'
      )
    : undefined

  return {
    request: {
      prompt: prompt.trim(),
      ...(choices !== undefined ? { choices } : {}),
      ...(typeof parsed.multiple === 'boolean'
        ? { multiple: parsed.multiple }
        : {}),
      ...(typeof parsed.allowFreeform === 'boolean'
        ? { allowFreeform: parsed.allowFreeform }
        : {}),
    },
  }
}

export const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'askUser',
    description:
      'Pause execution and ask the human a question before continuing.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The question to ask the human.',
        },
        choices: {
          type: 'array',
          description:
            'Optional answer choices for single-select or multi-select prompts.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['label', 'value'],
          },
        },
        multiple: {
          type: 'boolean',
          description: 'Allow more than one choice to be selected.',
        },
        allowFreeform: {
          type: 'boolean',
          description: 'Allow a custom text answer in addition to choices.',
        },
      },
      required: ['prompt'],
    },
  },
}

export const handler: ToolHandler = (_recording, args, context) => {
  const parsed = parseArgs(args)

  if ('error' in parsed) {
    return resolve(parsed.error)
  }

  if (context?.askUser === undefined) {
    return resolve(
      createError(
        'askUser is unavailable',
        'The runtime did not provide a host interaction callback',
        'Pass an `askUser` host callback into the agentic runtime before using the askUser tool.'
      )
    )
  }

  const toolCallId = context.toolCall?.id ?? ''
  return context.askUser(parsed.request, toolCallId)
}
