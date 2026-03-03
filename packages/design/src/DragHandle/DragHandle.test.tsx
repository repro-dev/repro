import expect from 'expect'
import { afterEach, before, describe, it } from 'node:test'
import React, { act, type ReactNode } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { DragHandle } from './DragHandle'

before(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let container: HTMLDivElement | null = null

function setUp() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
}

async function tearDown() {
  if (root) {
    await act(() => {
      root!.unmount()
    })
    root = null
  }
  if (container) {
    document.body.removeChild(container)
    container = null
  }
  ;(document.activeElement as HTMLElement | null)?.blur?.()
}

async function render(element: ReactNode) {
  if (!root || !container) {
    setUp()
  }
  await act(async () => {
    root!.render(element)
  })
}

function pressKey(key: string, target: Element) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

function noop() {}

describe('DragHandle', () => {
  afterEach(tearDown)

  it('renders with role="separator"', async () => {
    setUp()
    await render(
      <DragHandle
        edge="right"
        onDragStart={noop}
        onDragEnd={noop}
        onDrag={noop}
      />
    )

    const separator = document.querySelector('[role="separator"]')
    expect(separator).not.toBeNull()
  })

  it('sets aria-orientation to vertical for left/right edges', async () => {
    setUp()
    await render(
      <DragHandle
        edge="right"
        onDragStart={noop}
        onDragEnd={noop}
        onDrag={noop}
      />
    )

    const separator = document.querySelector('[role="separator"]')
    expect(separator?.getAttribute('aria-orientation')).toBe('vertical')
  })

  it('sets aria-orientation to horizontal for top/bottom edges', async () => {
    setUp()
    await render(
      <DragHandle
        edge="top"
        onDragStart={noop}
        onDragEnd={noop}
        onDrag={noop}
      />
    )

    const separator = document.querySelector('[role="separator"]')
    expect(separator?.getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('uses the default aria-label "Resize"', async () => {
    setUp()
    await render(
      <DragHandle
        edge="left"
        onDragStart={noop}
        onDragEnd={noop}
        onDrag={noop}
      />
    )

    const separator = document.querySelector('[role="separator"]')
    expect(separator?.getAttribute('aria-label')).toBe('Resize')
  })

  it('accepts a custom aria-label', async () => {
    setUp()
    await render(
      <DragHandle
        edge="left"
        onDragStart={noop}
        onDragEnd={noop}
        onDrag={noop}
        aria-label="Resize sidebar"
      />
    )

    const separator = document.querySelector('[role="separator"]')
    expect(separator?.getAttribute('aria-label')).toBe('Resize sidebar')
  })

  it('is focusable via tabIndex 0', async () => {
    setUp()
    await render(
      <DragHandle
        edge="bottom"
        onDragStart={noop}
        onDragEnd={noop}
        onDrag={noop}
      />
    )

    const separator = document.querySelector(
      '[role="separator"]'
    ) as HTMLElement
    expect(separator.tabIndex).toBe(0)
  })

  it('expands on ArrowRight for a right-edge handle', async () => {
    setUp()
    const calls: Array<{ type: string; delta?: number }> = []

    await render(
      <DragHandle
        edge="right"
        onDragStart={() => calls.push({ type: 'start' })}
        onDragEnd={() => calls.push({ type: 'end' })}
        onDrag={(delta: number) => calls.push({ type: 'drag', delta })}
      />
    )

    const separator = document.querySelector(
      '[role="separator"]'
    ) as HTMLElement
    pressKey('ArrowRight', separator)

    expect(calls).toEqual([
      { type: 'start' },
      { type: 'drag', delta: 10 },
      { type: 'end' },
    ])
  })

  it('shrinks on ArrowLeft for a right-edge handle', async () => {
    setUp()
    const calls: Array<{ type: string; delta?: number }> = []

    await render(
      <DragHandle
        edge="right"
        onDragStart={() => calls.push({ type: 'start' })}
        onDragEnd={() => calls.push({ type: 'end' })}
        onDrag={(delta: number) => calls.push({ type: 'drag', delta })}
      />
    )

    const separator = document.querySelector(
      '[role="separator"]'
    ) as HTMLElement
    pressKey('ArrowLeft', separator)

    expect(calls).toEqual([
      { type: 'start' },
      { type: 'drag', delta: -10 },
      { type: 'end' },
    ])
  })

  it('expands on ArrowLeft for a left-edge handle', async () => {
    setUp()
    const calls: Array<{ type: string; delta?: number }> = []

    await render(
      <DragHandle
        edge="left"
        onDragStart={() => calls.push({ type: 'start' })}
        onDragEnd={() => calls.push({ type: 'end' })}
        onDrag={(delta: number) => calls.push({ type: 'drag', delta })}
      />
    )

    const separator = document.querySelector(
      '[role="separator"]'
    ) as HTMLElement
    pressKey('ArrowLeft', separator)

    expect(calls).toEqual([
      { type: 'start' },
      { type: 'drag', delta: 10 },
      { type: 'end' },
    ])
  })

  it('expands on ArrowUp for a top-edge handle', async () => {
    setUp()
    const calls: Array<{ type: string; delta?: number }> = []

    await render(
      <DragHandle
        edge="top"
        onDragStart={() => calls.push({ type: 'start' })}
        onDragEnd={() => calls.push({ type: 'end' })}
        onDrag={(delta: number) => calls.push({ type: 'drag', delta })}
      />
    )

    const separator = document.querySelector(
      '[role="separator"]'
    ) as HTMLElement
    pressKey('ArrowUp', separator)

    expect(calls).toEqual([
      { type: 'start' },
      { type: 'drag', delta: 10 },
      { type: 'end' },
    ])
  })

  it('expands on ArrowDown for a bottom-edge handle', async () => {
    setUp()
    const calls: Array<{ type: string; delta?: number }> = []

    await render(
      <DragHandle
        edge="bottom"
        onDragStart={() => calls.push({ type: 'start' })}
        onDragEnd={() => calls.push({ type: 'end' })}
        onDrag={(delta: number) => calls.push({ type: 'drag', delta })}
      />
    )

    const separator = document.querySelector(
      '[role="separator"]'
    ) as HTMLElement
    pressKey('ArrowDown', separator)

    expect(calls).toEqual([
      { type: 'start' },
      { type: 'drag', delta: 10 },
      { type: 'end' },
    ])
  })

  it('ignores orthogonal arrow keys (e.g. ArrowUp on a right-edge handle)', async () => {
    setUp()
    const calls: Array<{ type: string; delta?: number }> = []

    await render(
      <DragHandle
        edge="right"
        onDragStart={() => calls.push({ type: 'start' })}
        onDragEnd={() => calls.push({ type: 'end' })}
        onDrag={(delta: number) => calls.push({ type: 'drag', delta })}
      />
    )

    const separator = document.querySelector(
      '[role="separator"]'
    ) as HTMLElement
    pressKey('ArrowUp', separator)
    pressKey('ArrowDown', separator)

    expect(calls).toEqual([])
  })

  it('prevents default on recognized arrow keys', async () => {
    setUp()
    await render(
      <DragHandle
        edge="right"
        onDragStart={noop}
        onDragEnd={noop}
        onDrag={noop}
      />
    )

    const separator = document.querySelector(
      '[role="separator"]'
    ) as HTMLElement
    const event = pressKey('ArrowRight', separator)

    expect(event.defaultPrevented).toBe(true)
  })
})
