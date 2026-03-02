import expect from 'expect'
import { afterEach, before, describe, it } from 'node:test'
import React, { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { Modal } from './Modal'

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

async function render(element: React.ReactNode) {
  if (!root || !container) {
    setUp()
  }
  await act(async () => {
    root!.render(element)
  })
}

describe('Modal', () => {
  afterEach(tearDown)

  it('renders with role="dialog"', async () => {
    setUp()
    await render(
      React.createElement(
        Modal,
        { width: 400, height: 300, 'aria-label': 'Test modal' },
        React.createElement('p', null, 'Content')
      )
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
  })

  it('sets aria-modal="true"', async () => {
    setUp()
    await render(
      React.createElement(
        Modal,
        { width: 400, height: 300, 'aria-label': 'Test modal' },
        React.createElement('p', null, 'Content')
      )
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
  })

  it('applies aria-label when provided', async () => {
    setUp()
    await render(
      React.createElement(
        Modal,
        { width: 400, height: 300, 'aria-label': 'Confirm action' },
        React.createElement('p', null, 'Content')
      )
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('Confirm action')
  })

  it('applies aria-labelledby when labelId is provided', async () => {
    setUp()
    await render(
      React.createElement(
        Modal,
        { width: 400, height: 300, labelId: 'modal-title' },
        React.createElement('h2', { id: 'modal-title' }, 'Title')
      )
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-labelledby')).toBe('modal-title')
  })

  it('prefers aria-label over labelId when both provided', async () => {
    setUp()
    await render(
      React.createElement(
        Modal,
        {
          width: 400,
          height: 300,
          'aria-label': 'Direct label',
          labelId: 'modal-title',
        },
        React.createElement('h2', { id: 'modal-title' }, 'Title')
      )
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('Direct label')
    expect(dialog?.getAttribute('aria-labelledby')).toBeNull()
  })

  it('traps focus inside the dialog', async () => {
    setUp()

    const outer = document.createElement('button')
    outer.id = 'outer'
    document.body.appendChild(outer)
    outer.focus()
    expect(document.activeElement).toBe(outer)

    await render(
      React.createElement(
        Modal,
        { width: 400, height: 300, 'aria-label': 'Focus test' },
        React.createElement('button', { id: 'inside-1' }, 'First'),
        React.createElement('button', { id: 'inside-2' }, 'Second')
      )
    )

    expect(document.activeElement?.id).toBe('inside-1')

    document.body.removeChild(outer)
  })

  it('calls onClose when Escape is pressed', async () => {
    setUp()
    let closed = false

    await render(
      React.createElement(
        Modal,
        {
          width: 400,
          height: 300,
          'aria-label': 'Escape test',
          onClose: () => {
            closed = true
          },
        },
        React.createElement('p', null, 'Content')
      )
    )

    await act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      )
    })

    expect(closed).toBe(true)
  })

  it('does not call onClose on Escape when onClose is not provided', async () => {
    setUp()
    await render(
      React.createElement(
        Modal,
        { width: 400, height: 300, 'aria-label': 'No close' },
        React.createElement('p', null, 'Content')
      )
    )

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })

    expect(() => document.dispatchEvent(event)).not.toThrow()
  })

  it('calls onClose when the backdrop is clicked', async () => {
    setUp()
    let closed = false

    await render(
      React.createElement(
        Modal,
        {
          width: 400,
          height: 300,
          'aria-label': 'Backdrop test',
          onClose: () => {
            closed = true
          },
        },
        React.createElement('p', null, 'Content')
      )
    )

    const dialog = document.querySelector('[role="dialog"]')
    const backdrop = dialog?.parentElement
    expect(backdrop).not.toBeNull()

    await act(() => {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(clickEvent, 'target', { value: backdrop })
      Object.defineProperty(clickEvent, 'currentTarget', { value: backdrop })
      backdrop!.dispatchEvent(clickEvent)
    })

    expect(closed).toBe(true)
  })

  it('does not close when clicking inside the dialog', async () => {
    setUp()
    let closed = false

    await render(
      React.createElement(
        Modal,
        {
          width: 400,
          height: 300,
          'aria-label': 'Inner click test',
          onClose: () => {
            closed = true
          },
        },
        React.createElement('button', { id: 'inner-btn' }, 'Click me')
      )
    )

    const innerBtn = document.getElementById('inner-btn')!
    await act(() => {
      innerBtn.click()
    })

    expect(closed).toBe(false)
  })
})
