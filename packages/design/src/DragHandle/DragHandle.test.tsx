import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { DragHandle } from './DragHandle'

afterEach(cleanup)

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
  it('renders with role="separator"', () => {
    render(
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

  it('sets aria-orientation to vertical for left/right edges', () => {
    render(
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

  it('sets aria-orientation to horizontal for top/bottom edges', () => {
    render(
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

  it('uses the default aria-label "Resize"', () => {
    render(
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

  it('accepts a custom aria-label', () => {
    render(
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

  it('is focusable via tabIndex 0', () => {
    render(
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

  it('expands on ArrowRight for a right-edge handle', () => {
    const calls: Array<{ type: string; delta?: number }> = []

    render(
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

  it('shrinks on ArrowLeft for a right-edge handle', () => {
    const calls: Array<{ type: string; delta?: number }> = []

    render(
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

  it('expands on ArrowLeft for a left-edge handle', () => {
    const calls: Array<{ type: string; delta?: number }> = []

    render(
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

  it('expands on ArrowUp for a top-edge handle', () => {
    const calls: Array<{ type: string; delta?: number }> = []

    render(
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

  it('expands on ArrowDown for a bottom-edge handle', () => {
    const calls: Array<{ type: string; delta?: number }> = []

    render(
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

  it('ignores orthogonal arrow keys (e.g. ArrowUp on a right-edge handle)', () => {
    const calls: Array<{ type: string; delta?: number }> = []

    render(
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

  it('prevents default on recognized arrow keys', () => {
    render(
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
