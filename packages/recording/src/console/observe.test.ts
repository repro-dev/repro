/**
 * @jest-environment jsdom
 */

import { ConsoleMessage, LogLevel, MessagePartType } from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import { createConsoleObserver } from './observe'

describe('libs/record: console observers', () => {
  let observer: ObserverLike | null = null
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  }

  afterEach(() => {
    observer?.disconnect()
    observer = null

    console.log = originalConsole.log
    console.info = originalConsole.info
    console.warn = originalConsole.warn
    console.error = originalConsole.error
    console.debug = originalConsole.debug
  })

  function silenceConsole() {
    const noop = () => {}
    console.log = noop
    console.info = noop
    console.warn = noop
    console.error = noop
    console.debug = noop
  }

  function flush() {
    return new Promise(resolve => setTimeout(resolve, 25))
  }

  it('scrubs secret-like object properties before serialization', async () => {
    silenceConsole()

    const messages: Array<ConsoleMessage> = []

    observer = createConsoleObserver(message => {
      messages.push(message)
    })
    observer.observe(document, { rootId: 'foo', nodes: {} } as any)

    console.log({
      message: 'hello',
      token: 'secret-token',
      nested: {
        password: 'super-secret',
      },
      count: 2,
    })

    await flush()

    expect(messages).toHaveLength(1)
    const firstMessage = messages[0] as any
    expect(firstMessage.level).toBe(LogLevel.Info)
    expect((firstMessage.parts[0] as any).value).toMatchObject({
      type: MessagePartType.String,
      value: JSON.stringify({
        message: 'hello',
        token: '[MASKED]',
        nested: {
          password: '[MASKED]',
        },
        count: 2,
      }),
    })
  })

  it('scrubs obvious secret strings while leaving ordinary strings intact', async () => {
    silenceConsole()

    const messages: Array<ConsoleMessage> = []

    observer = createConsoleObserver(message => {
      messages.push(message)
    })
    observer.observe(document, { rootId: 'foo', nodes: {} } as any)

    console.log('Authorization: Bearer super-secret-token')
    console.log('plain text message')

    await flush()

    expect(messages).toHaveLength(2)
    const firstMessage = messages[0] as any
    const secondMessage = messages[1] as any

    expect(firstMessage.level).toBe(LogLevel.Info)
    expect((firstMessage.parts[0] as any).value).toMatchObject({
      type: MessagePartType.String,
      value: JSON.stringify('[MASKED]'),
    })
    expect(secondMessage.level).toBe(LogLevel.Info)
    expect((secondMessage.parts[0] as any).value).toMatchObject({
      type: MessagePartType.String,
      value: JSON.stringify('plain text message'),
    })
  })
})
