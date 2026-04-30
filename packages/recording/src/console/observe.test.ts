/**
 * @jest-environment jsdom
 */

import {
  ConsoleMessage,
  LogLevel,
  MessagePartType,
  NodeType,
} from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import { deepUnbox } from '@repro/testing-utils'
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

  async function waitForMessages(
    messages: Array<ConsoleMessage>,
    expectedCount: number,
    timeoutMs = 250
  ) {
    const deadline = Date.now() + timeoutMs

    while (messages.length < expectedCount && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  function expectLayoutPreservingMask(value: string, original: string) {
    expect(value).not.toBe('[MASKED]')
    expect(value).toHaveLength(original.length)

    const maskedChars = Array.from(value)
    Array.from(original).forEach((char, index) => {
      expect(maskedChars[index]).toBe(/\s/u.test(char) ? char : '*')
    })
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

    await waitForMessages(messages, 1)

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

    await waitForMessages(messages, 2)

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

  it('redacts masked DOM nodes without collapsing whitespace', async () => {
    silenceConsole()

    const messages: Array<ConsoleMessage> = []
    const maskedRoot = document.createElement('div')
    maskedRoot.className = 'repro-mask'
    const maskedText = document.createTextNode('secret text\nmore secret')
    maskedRoot.append(maskedText)
    document.body.append(maskedRoot)

    observer = createConsoleObserver(
      message => {
        messages.push(message)
      },
      ['.repro-mask']
    )
    observer.observe(document, { rootId: 'foo', nodes: {} } as any)

    console.log(maskedText)

    await waitForMessages(messages, 1)

    expect(messages).toHaveLength(1)
    const firstMessage = messages[0] as any
    const nodePart = deepUnbox(firstMessage.parts[0]) as any

    expect(nodePart).toMatchObject({
      type: MessagePartType.Node,
      node: {
        type: NodeType.Text,
      },
    })
    expectLayoutPreservingMask(nodePart.node.value, 'secret text\nmore secret')

    document.body.removeChild(maskedRoot)
  })
})
