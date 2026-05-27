import { cleanup, fireEvent, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { act } from 'react'
import { PortalRootProvider } from '../Portal'
import { ConfirmDialog } from './ConfirmDialog'
import { ConfirmDialogProvider } from './ConfirmDialogProvider'
import { useConfirm } from './useConfirm'

afterEach(cleanup)

function renderWithPortal(ui: React.ReactElement) {
  return render(<PortalRootProvider>{ui}</PortalRootProvider>)
}

describe('ConfirmDialog', () => {
  it('renders dialog when open', () => {
    renderWithPortal(
      <ConfirmDialog
        open={true}
        onConfirm={() => {}}
        onCancel={() => {}}
        title="Delete item"
      />
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
  })

  it('does not render when not open', () => {
    renderWithPortal(
      <ConfirmDialog
        open={false}
        onConfirm={() => {}}
        onCancel={() => {}}
        title="Delete item"
      />
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeNull()
  })

  it('displays title', () => {
    renderWithPortal(
      <ConfirmDialog
        open={true}
        onConfirm={() => {}}
        onCancel={() => {}}
        title="Confirm deletion"
      />
    )

    expect(document.body.textContent).toContain('Confirm deletion')
  })

  it('displays description when provided', () => {
    renderWithPortal(
      <ConfirmDialog
        open={true}
        onConfirm={() => {}}
        onCancel={() => {}}
        title="Delete"
        description="This action cannot be undone."
      />
    )

    expect(document.body.textContent).toContain('This action cannot be undone.')
  })

  it('calls onConfirm when confirm button is clicked', async () => {
    let confirmed = false

    renderWithPortal(
      <ConfirmDialog
        open={true}
        onConfirm={() => {
          confirmed = true
        }}
        onCancel={() => {}}
        title="Confirm action"
        confirmLabel="Yes, proceed"
      />
    )

    const confirmBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.textContent === 'Yes, proceed'
    )
    expect(confirmBtn).not.toBeNull()

    await act(() => {
      fireEvent.click(confirmBtn!)
    })

    expect(confirmed).toBe(true)
  })

  it('calls onCancel when cancel button is clicked', async () => {
    let cancelled = false

    renderWithPortal(
      <ConfirmDialog
        open={true}
        onConfirm={() => {}}
        onCancel={() => {
          cancelled = true
        }}
        title="Confirm action"
        cancelLabel="No thanks"
      />
    )

    const cancelBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.textContent === 'No thanks'
    )
    expect(cancelBtn).not.toBeNull()

    await act(() => {
      fireEvent.click(cancelBtn!)
    })

    expect(cancelled).toBe(true)
  })

  it('destructive variant applies danger context to confirm button', () => {
    renderWithPortal(
      <ConfirmDialog
        open={true}
        onConfirm={() => {}}
        onCancel={() => {}}
        title="Delete recording"
        variant="destructive"
        confirmLabel="Delete"
      />
    )

    expect(document.body.textContent).toContain('Delete')
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
  })
})

describe('useConfirm', () => {
  it('resolves true when confirmed', async () => {
    let resolvedValue: boolean | null = null

    const TestComponent = () => {
      const confirm = useConfirm()

      return (
        <button
          onClick={async () => {
            resolvedValue = await confirm({
              title: 'Are you sure?',
              confirmLabel: 'Yes',
            })
          }}
        >
          trigger
        </button>
      )
    }

    renderWithPortal(
      <ConfirmDialogProvider>
        <TestComponent />
      </ConfirmDialogProvider>
    )

    const triggerBtn = document.querySelector('button')!
    await act(() => {
      fireEvent.click(triggerBtn)
    })

    const confirmBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.textContent === 'Yes'
    )
    expect(confirmBtn).not.toBeNull()

    await act(() => {
      fireEvent.click(confirmBtn!)
    })

    expect(resolvedValue).toBe(true)
  })

  it('resolves false when cancelled', async () => {
    let resolvedValue: boolean | null = null

    const TestComponent = () => {
      const confirm = useConfirm()

      return (
        <button
          onClick={async () => {
            resolvedValue = await confirm({
              title: 'Are you sure?',
              cancelLabel: 'Nope',
            })
          }}
        >
          trigger
        </button>
      )
    }

    renderWithPortal(
      <ConfirmDialogProvider>
        <TestComponent />
      </ConfirmDialogProvider>
    )

    const triggerBtn = document.querySelector('button')!
    await act(() => {
      fireEvent.click(triggerBtn)
    })

    const cancelBtn = Array.from(document.querySelectorAll('button')).find(
      b => b.textContent === 'Nope'
    )
    expect(cancelBtn).not.toBeNull()

    await act(() => {
      fireEvent.click(cancelBtn!)
    })

    expect(resolvedValue).toBe(false)
  })
})
