import { cleanup, fireEvent, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { AgenticInput } from './AgenticInput'

afterEach(cleanup)

describe('AgenticInput — history navigation props', () => {
  it('calls onNavigateHistory("up") when ArrowUp is pressed in an empty input', () => {
    const onNavigateHistory = mock.fn()
    const { container } = render(
      <AgenticInput
        onFocusChange={() => {}}
        onSubmit={() => {}}
        onNavigateHistory={onNavigateHistory}
      />
    )
    const textarea = container.querySelector('textarea')!
    fireEvent.keyDown(textarea, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(onNavigateHistory.mock.calls.length).toBe(1)
    expect(onNavigateHistory.mock.calls[0]?.arguments[0]).toBe('up')
  })

  it('does NOT call onNavigateHistory("down") when ArrowDown is pressed and not in history mode (historyValue is null)', () => {
    const onNavigateHistory = mock.fn()
    const { container } = render(
      <AgenticInput
        onFocusChange={() => {}}
        onSubmit={() => {}}
        onNavigateHistory={onNavigateHistory}
        historyValue={null}
      />
    )
    const textarea = container.querySelector('textarea')!
    fireEvent.keyDown(textarea, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(onNavigateHistory.mock.calls.length).toBe(0)
  })

  it('calls onNavigateHistory("down") when ArrowDown is pressed while in history mode (historyValue is non-null)', () => {
    const onNavigateHistory = mock.fn()
    const { container } = render(
      <AgenticInput
        onFocusChange={() => {}}
        onSubmit={() => {}}
        onNavigateHistory={onNavigateHistory}
        historyValue="some history entry"
      />
    )
    const textarea = container.querySelector('textarea')!
    fireEvent.keyDown(textarea, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(onNavigateHistory.mock.calls.length).toBe(1)
    expect(onNavigateHistory.mock.calls[0]?.arguments[0]).toBe('down')
  })

  it('does NOT call onNavigateHistory when ArrowUp is pressed in a non-empty input with cursor not at 0', () => {
    const onNavigateHistory = mock.fn()
    const { container } = render(
      <AgenticInput
        onFocusChange={() => {}}
        onSubmit={() => {}}
        onNavigateHistory={onNavigateHistory}
      />
    )
    const textarea = container.querySelector('textarea')!
    // Type some text so the input is non-empty
    fireEvent.change(textarea, { target: { value: 'hello' } })
    // Simulate cursor in the middle of text (selectionStart = 3)
    Object.defineProperty(textarea, 'selectionStart', {
      value: 3,
      configurable: true,
    })
    fireEvent.keyDown(textarea, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(onNavigateHistory.mock.calls.length).toBe(0)
  })

  it('calls onNavigateHistory when ArrowUp is pressed with cursor at position 0 in non-empty input', () => {
    const onNavigateHistory = mock.fn()
    const { container } = render(
      <AgenticInput
        onFocusChange={() => {}}
        onSubmit={() => {}}
        onNavigateHistory={onNavigateHistory}
      />
    )
    const textarea = container.querySelector('textarea')!
    // Type some text
    fireEvent.change(textarea, { target: { value: 'hello' } })
    // Cursor at position 0
    Object.defineProperty(textarea, 'selectionStart', {
      value: 0,
      configurable: true,
    })
    fireEvent.keyDown(textarea, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(onNavigateHistory.mock.calls.length).toBe(1)
  })

  it('populates input with historyValue when it changes to a non-null string', () => {
    let rerender: (ui: React.ReactElement) => void

    const { rerender: rerenderFn, container } = render(
      <AgenticInput
        onFocusChange={() => {}}
        onSubmit={() => {}}
        historyValue={null}
      />
    )
    rerender = rerenderFn

    const textarea = container.querySelector('textarea')!
    expect(textarea.value).toBe('')

    rerender(
      <AgenticInput
        onFocusChange={() => {}}
        onSubmit={() => {}}
        historyValue="previous message"
      />
    )
    expect(textarea.value).toBe('previous message')
  })

  it('clears input to empty when historyValue changes to null after being set', () => {
    const { rerender, container } = render(
      <AgenticInput
        onFocusChange={() => {}}
        onSubmit={() => {}}
        historyValue="previous message"
      />
    )
    const textarea = container.querySelector('textarea')!
    expect(textarea.value).toBe('previous message')

    rerender(
      <AgenticInput
        onFocusChange={() => {}}
        onSubmit={() => {}}
        historyValue={null}
      />
    )
    expect(textarea.value).toBe('')
  })
})
