/**
 * @jest-environment jsdom
 */

import { InteractionType, NodeType } from '@repro/domain'
import { deepUnbox } from '@repro/testing-utils'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import { createDOMTreeWalker } from '../dom/utils'
import { createDOMVisitor } from '../dom/visitor'
import { MASKED_VALUE } from '../redaction'
import { RecordingOptions } from '../types'
import { createInteractionObserver } from './observe'

describe('libs/record: interaction observers', () => {
  let observer: ReturnType<typeof createInteractionObserver> | null = null

  afterEach(() => {
    observer?.disconnect()
    observer = null
  })

  it('redacts masked button labels in click metadata', () => {
    const clicks: Array<any> = []
    const maskedRoot = document.createElement('div')
    maskedRoot.className = 'repro-mask'
    const button = document.createElement('button')
    button.textContent = 'secret action'
    maskedRoot.append(button)
    document.body.append(maskedRoot)

    const options: RecordingOptions = {
      types: new Set(['interaction']),
      snapshotInterval: 10_000,
      ignoredNodes: [],
      ignoredSelectors: [],
      maskedSelectors: ['.repro-mask'],
      eventSampling: {
        pointerMove: 50,
        resize: 250,
        scroll: 100,
      },
    }

    const walkDOMTree = createDOMTreeWalker(options)
    walkDOMTree.acceptDOMVisitor(createDOMVisitor(options))
    const vtree = walkDOMTree(document)

    observer = createInteractionObserver(options, interaction => {
      clicks.push(interaction)
    })
    observer.observe(document, vtree as any)

    clicks.length = 0

    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [button],
    })

    button.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        button: 0,
        clientX: 1,
        clientY: 1,
      })
    )

    expect(clicks).toHaveLength(1)
    const click = deepUnbox(clicks[0]) as any

    expect(click.type).toBe(InteractionType.Click)
    expect(click.meta.humanReadableLabel).toBe(MASKED_VALUE)
    expect(click.meta.node.type).toBe(NodeType.Element)

    document.body.removeChild(maskedRoot)
  })
})
