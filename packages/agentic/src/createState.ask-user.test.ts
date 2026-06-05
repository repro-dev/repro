import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_TOOL_ITERATIONS, createAgenticState } from './createState'
import type { RecordingDataAccessor, StreamProvider } from './types'

function makeEmptyAccessor(): RecordingDataAccessor {
  return {
    getDuration: () => 0,
    getSnapshotAtTime: () => null,
    getResourceMap: () => ({}),
    getEventsByType: () => [],
    getEventsInRange: () => [],
  }
}

function makeSseStream(chunks: Array<Record<string, unknown> | string>) {
  return new ReadableStream<{ data: string }>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue({
          data: typeof chunk === 'string' ? chunk : JSON.stringify(chunk),
        })
      }
      controller.close()
    },
  })
}

function makeToolCallEvent(
  id: string,
  name: string,
  args: Record<string, unknown>
) {
  return {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id,
              function: {
                name,
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
      },
    ],
  }
}

function makeTextEvent(content: string) {
  return {
    choices: [
      {
        delta: {
          content,
        },
      },
    ],
  }
}

function waitForCondition(predicate: () => boolean, timeout = 2000) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const start = Date.now()

    const check = () => {
      if (predicate()) {
        resolvePromise()
        return
      }

      if (Date.now() - start >= timeout) {
        rejectPromise(new Error('Timed out waiting for condition'))
        return
      }

      setTimeout(check, 10)
    }

    check()
  })
}

test('pauses on askUser and resumes when the host submits an answer', async () => {
  let callCount = 0

  const streamProvider: StreamProvider = () => {
    callCount += 1

    if (callCount === 1) {
      return resolve(
        makeSseStream([
          makeToolCallEvent('tool-call-1', 'askUser', {
            prompt: 'Pick one',
            choices: [{ label: 'Yes', value: 'yes' }],
          }),
          '[DONE]',
        ])
      ) as never
    }

    return resolve(
      makeSseStream([makeTextEvent('Answer received'), '[DONE]'])
    ) as never
  }

  const state = createAgenticState(streamProvider, makeEmptyAccessor())

  state.query('Need input')

  await waitForCondition(() => state.$pendingInteraction.getValue() !== null)
  assert.equal(state.$loading.getValue(), 'tool-executing')

  state.submitAskUserAnswer({ answer: 'yes' })

  await waitForCondition(() => callCount === 2)
  await waitForCondition(() => state.$loading.getValue() === 'none')

  const entries = state.$entries.getValue()
  const toolMessages = entries.filter(entry => entry.role === 'tool')

  assert.equal(state.$pendingInteraction.getValue(), null)
  assert.equal(toolMessages.length, 1)
  assert.equal(toolMessages[0]?.tool_call_id, 'tool-call-1')
})

test('rejects repeated duplicate askUser batches deterministically', async () => {
  let callCount = 0

  const streamProvider: StreamProvider = () => {
    callCount += 1

    if (callCount === 1) {
      return resolve(
        makeSseStream([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'tool-call-1',
                      function: {
                        name: 'askUser',
                        arguments: JSON.stringify({ prompt: 'Pick one' }),
                      },
                    },
                    {
                      index: 1,
                      id: 'tool-call-2',
                      function: {
                        name: 'askUser',
                        arguments: JSON.stringify({ prompt: 'Pick another' }),
                      },
                    },
                  ],
                },
              },
            ],
          },
          '[DONE]',
        ])
      ) as never
    }

    if (callCount === 2) {
      return resolve(
        makeSseStream([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'tool-call-3',
                      function: {
                        name: 'askUser',
                        arguments: JSON.stringify({ prompt: 'Pick one' }),
                      },
                    },
                    {
                      index: 1,
                      id: 'tool-call-4',
                      function: {
                        name: 'askUser',
                        arguments: JSON.stringify({ prompt: 'Pick another' }),
                      },
                    },
                  ],
                },
              },
            ],
          },
          '[DONE]',
        ])
      ) as never
    }

    return resolve(
      makeSseStream([makeTextEvent('Recovered'), '[DONE]'])
    ) as never
  }

  const state = createAgenticState(streamProvider, makeEmptyAccessor())

  state.query('Need input')

  await waitForCondition(() => callCount === 2)
  await waitForCondition(() => state.$loading.getValue() === 'none')

  const toolMessages = state.$entries
    .getValue()
    .filter(entry => entry.role === 'tool')

  assert.equal(state.$pendingInteraction.getValue(), null)
  assert.equal(callCount, 3)
  assert.equal(toolMessages.length, 4)
  assert.deepEqual(
    toolMessages.map(entry => entry.tool_call_id),
    ['tool-call-1', 'tool-call-2', 'tool-call-3', 'tool-call-4']
  )
  assert.ok(toolMessages.every(entry => typeof entry.content === 'string'))
})

test('stops repeated invalid askUser batches at the iteration limit', async () => {
  let callCount = 0

  const streamProvider: StreamProvider = () => {
    callCount += 1

    return resolve(
      makeSseStream([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: `tool-call-${callCount}-a`,
                    function: {
                      name: 'askUser',
                      arguments: JSON.stringify({ prompt: 'Pick one' }),
                    },
                  },
                  {
                    index: 1,
                    id: `tool-call-${callCount}-b`,
                    function: {
                      name: 'askUser',
                      arguments: JSON.stringify({ prompt: 'Pick another' }),
                    },
                  },
                ],
              },
            },
          ],
        },
        '[DONE]',
      ])
    ) as never
  }

  const state = createAgenticState(streamProvider, makeEmptyAccessor())

  state.query('Need input')

  await waitForCondition(() => state.$loading.getValue() === 'none')

  const toolMessages = state.$entries
    .getValue()
    .filter(entry => entry.role === 'tool')

  assert.equal(callCount, MAX_TOOL_ITERATIONS)
  assert.ok(toolMessages.length >= MAX_TOOL_ITERATIONS * 2)
  assert.ok(
    state.$entries
      .getValue()
      .some(
        entry =>
          entry.role === 'assistant' &&
          entry.content.includes('iteration limit')
      )
  )
})

test('cancel and reset clear pending askUser state', async () => {
  const streamProvider: StreamProvider = () =>
    resolve(
      makeSseStream([
        makeToolCallEvent('tool-call-1', 'askUser', { prompt: 'Pick one' }),
        '[DONE]',
      ])
    ) as never

  const state = createAgenticState(streamProvider, makeEmptyAccessor())

  state.query('Need input')

  await waitForCondition(() => state.$pendingInteraction.getValue() !== null)
  state.cancel()
  state.submitAskUserAnswer({ answer: 'ignored' })

  await waitForCondition(() => state.$loading.getValue() === 'none')
  assert.equal(state.$pendingInteraction.getValue(), null)
  assert.ok(state.$entries.getValue().length >= 2)

  state.reset()

  assert.equal(state.$pendingInteraction.getValue(), null)
  assert.equal(state.$entries.getValue().length, 0)
  assert.equal(state.$loading.getValue(), 'none')
})
