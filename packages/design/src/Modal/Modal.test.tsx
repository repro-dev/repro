import { dispatchAnimationEnd } from '@repro/testing-utils'
import { cleanup, render, waitFor } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { act } from 'react'
import { PortalRootProvider } from '../Portal'
import { spacing } from '../tokens/spacing'
import { Modal } from './Modal'

afterEach(cleanup)

function renderModal(ui: React.ReactElement) {
  const result = render(<PortalRootProvider>{ui}</PortalRootProvider>)

  return {
    ...result,
    rerender: (nextUi: React.ReactElement) =>
      result.rerender(<PortalRootProvider>{nextUi}</PortalRootProvider>),
  }
}

describe('Modal', () => {
  it('renders dialog content through the portal root instead of inline under its React parent', () => {
    const { getByTestId } = render(
      <PortalRootProvider>
        <div data-testid="modal-react-parent">
          <Modal width={400} height={300} aria-label="Portaled modal">
            <p>Portaled content</p>
          </Modal>
        </div>
      </PortalRootProvider>
    )

    const dialog = document.querySelector('[role="dialog"]')
    const reactParent = getByTestId('modal-react-parent')

    expect(dialog).not.toBeNull()
    expect(reactParent.contains(dialog)).toBe(false)
  })

  it('renders with role="dialog"', () => {
    renderModal(
      <Modal width={400} height={300} aria-label="Test modal">
        <p>Content</p>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
  })

  it('sets aria-modal="true"', () => {
    renderModal(
      <Modal width={400} height={300} aria-label="Test modal">
        <p>Content</p>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
  })

  it('applies aria-label when provided', () => {
    renderModal(
      <Modal width={400} height={300} aria-label="Confirm action">
        <p>Content</p>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('Confirm action')
  })

  it('applies aria-labelledby when labelId is provided', () => {
    renderModal(
      <Modal width={400} height={300} labelId="modal-title">
        <h2 id="modal-title">Title</h2>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-labelledby')).toBe('modal-title')
  })

  it('renders a modal header as a proper heading with description text', () => {
    renderModal(
      <Modal width={400} height={300} aria-label="Header test">
        <Modal.Header
          title="Deactivate user?"
          description="This action cannot be undone."
        />
      </Modal>
    )

    const title = document.querySelector('h2')

    expect(title).not.toBeNull()
    expect(title?.textContent).toBe('Deactivate user?')
    expect(window.getComputedStyle(title as HTMLElement).fontSize).toBe('20px')
    expect(document.querySelector('p')?.textContent).toBe(
      'This action cannot be undone.'
    )
  })

  it('renders a modal body with standard padding and spacing', () => {
    renderModal(
      <Modal width={400} height={300} aria-label="Body test">
        <Modal.Body>
          <p>First line</p>
          <p>Second line</p>
        </Modal.Body>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    const body = dialog?.firstElementChild as HTMLElement | null
    const styles = window.getComputedStyle(body!)

    expect(body).not.toBeNull()
    expect(styles.paddingTop).toBe(`${spacing.xl}px`)
    expect(document.body.textContent).toContain('First line')
    expect(document.body.textContent).toContain('Second line')
  })

  it('prefers aria-label over labelId when both provided', () => {
    renderModal(
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

  it('traps focus inside the dialog', async () => {
    const outer = document.createElement('button')
    outer.id = 'outer'
    document.body.appendChild(outer)
    outer.focus()
    expect(document.activeElement).toBe(outer)

    renderModal(
      <Modal width={400} height={300} aria-label="Focus test">
        <button id="inside-1">First</button>
        <button id="inside-2">Second</button>
      </Modal>
    )

    await waitFor(() => {
      expect(document.activeElement?.id).toBe('inside-1')
    })

    document.body.removeChild(outer)
  })

  it('calls onClose when Escape is pressed', async () => {
    let closed = false

    renderModal(
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
    renderModal(
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

    renderModal(
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

    renderModal(
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

describe('Modal open prop and animation', () => {
  it('renders dialog when open is true (default)', () => {
    renderModal(
      <Modal width={400} height={300} aria-label="Test modal" open>
        <p>Content</p>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
  })

  it('does not render dialog when open is false (after animationend)', async () => {
    const { rerender } = renderModal(
      <Modal width={400} height={300} aria-label="Test modal" open={true}>
        <p>Content</p>
      </Modal>
    )

    await rerender(
      <Modal width={400} height={300} aria-label="Test modal" open={false}>
        <p>Content</p>
      </Modal>
    )

    // Trigger the animationend event on the backdrop to complete exit animation
    const backdrop = document.querySelector('[data-testid="modal-backdrop"]')
    if (backdrop) {
      await act(() => {
        dispatchAnimationEnd(backdrop)
      })
    }

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeNull()
  })

  it('renders dialog when open defaults to true (backward compat)', () => {
    renderModal(
      <Modal width={400} height={300} aria-label="Test modal">
        <p>Content</p>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
  })

  it('applies entering animation class on mount when open', () => {
    renderModal(
      <Modal width={400} height={300} aria-label="Test modal" open={true}>
        <p>Content</p>
      </Modal>
    )

    const backdrop = document.querySelector('[data-testid="modal-backdrop"]')
    expect(backdrop).not.toBeNull()
    // The backdrop should have an animation applied during entering phase
    const style = (backdrop as HTMLElement | null)?.getAttribute('style') ?? ''
    expect(style).toContain('modal-backdrop-in')
  })

  it('applies exiting animation when open transitions to false', async () => {
    const { rerender } = renderModal(
      <Modal width={400} height={300} aria-label="Test modal" open={true}>
        <p>Content</p>
      </Modal>
    )

    await act(async () => {
      await rerender(
        <Modal width={400} height={300} aria-label="Test modal" open={false}>
          <p>Content</p>
        </Modal>
      )
    })

    const backdrop = document.querySelector('[data-testid="modal-backdrop"]')
    expect(backdrop).not.toBeNull()
    const style = (backdrop as HTMLElement | null)?.getAttribute('style') ?? ''
    expect(style).toContain('modal-backdrop-out')
  })

  it('can reopen after being closed', async () => {
    const ToggleModal = () => {
      const [open, setOpen] = React.useState(true)
      return (
        <>
          <button onClick={() => setOpen(o => !o)}>Toggle</button>
          <Modal
            width={400}
            height={300}
            aria-label="Toggle test"
            open={open}
            onClose={() => setOpen(false)}
          >
            <p>Content</p>
          </Modal>
        </>
      )
    }

    renderModal(<ToggleModal />)

    // Close the modal
    await act(async () => {
      document.querySelector('button')!.click()
    })

    // Trigger animationend to complete unmount
    const backdrop = document.querySelector('[data-testid="modal-backdrop"]')
    if (backdrop) {
      await act(() => {
        dispatchAnimationEnd(backdrop)
      })
    }

    // Reopen the modal
    await act(async () => {
      document.querySelector('button')!.click()
    })

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
  })
})
