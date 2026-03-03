import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { act } from 'react'
import { Modal } from './Modal'

afterEach(cleanup)

describe('Modal', () => {
  it('renders with role="dialog"', () => {
    render(
      <Modal width={400} height={300} aria-label="Test modal">
        <p>Content</p>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
  })

  it('sets aria-modal="true"', () => {
    render(
      <Modal width={400} height={300} aria-label="Test modal">
        <p>Content</p>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
  })

  it('applies aria-label when provided', () => {
    render(
      <Modal width={400} height={300} aria-label="Confirm action">
        <p>Content</p>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('Confirm action')
  })

  it('applies aria-labelledby when labelId is provided', () => {
    render(
      <Modal width={400} height={300} labelId="modal-title">
        <h2 id="modal-title">Title</h2>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-labelledby')).toBe('modal-title')
  })

  it('prefers aria-label over labelId when both provided', () => {
    render(
      <Modal
        width={400}
        height={300}
        aria-label="Direct label"
        labelId="modal-title"
      >
        <h2 id="modal-title">Title</h2>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('Direct label')
    expect(dialog?.getAttribute('aria-labelledby')).toBeNull()
  })

  it('traps focus inside the dialog', () => {
    const outer = document.createElement('button')
    outer.id = 'outer'
    document.body.appendChild(outer)
    outer.focus()
    expect(document.activeElement).toBe(outer)

    render(
      <Modal width={400} height={300} aria-label="Focus test">
        <button id="inside-1">First</button>
        <button id="inside-2">Second</button>
      </Modal>
    )

    expect(document.activeElement?.id).toBe('inside-1')

    document.body.removeChild(outer)
  })

  it('calls onClose when Escape is pressed', async () => {
    let closed = false

    render(
      <Modal
        width={400}
        height={300}
        aria-label="Escape test"
        onClose={() => {
          closed = true
        }}
      >
        <p>Content</p>
      </Modal>
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

  it('does not call onClose on Escape when onClose is not provided', () => {
    render(
      <Modal width={400} height={300} aria-label="No close">
        <p>Content</p>
      </Modal>
    )

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })

    expect(() => document.dispatchEvent(event)).not.toThrow()
  })

  it('calls onClose when the backdrop is clicked', async () => {
    let closed = false

    render(
      <Modal
        width={400}
        height={300}
        aria-label="Backdrop test"
        onClose={() => {
          closed = true
        }}
      >
        <p>Content</p>
      </Modal>
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
    let closed = false

    render(
      <Modal
        width={400}
        height={300}
        aria-label="Inner click test"
        onClose={() => {
          closed = true
        }}
      >
        <button id="inner-btn">Click me</button>
      </Modal>
    )

    const innerBtn = document.getElementById('inner-btn')!
    await act(() => {
      innerBtn.click()
    })

    expect(closed).toBe(false)
  })
})
