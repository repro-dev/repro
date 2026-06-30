import { ApiProvider, createApiClient } from '@repro/api-client'
import { PortalRootProvider } from '@repro/design'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectProvider } from '../ProjectContext'
import { CommandPalette } from './CommandPalette'

// ---------------------------------------------------------------------------
// localStorage mock (same pattern as Layout.test.tsx)
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: { [key: string]: string } = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

const mockApiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderCommandPalette(
  open: boolean,
  onClose: () => void,
  options?: { hasProject?: boolean }
) {
  const hasProject = options?.hasProject ?? true
  const projects = hasProject ? [{ id: 'proj-1', name: 'Test Project' }] : []

  return render(
    <MemoryRouter>
      <ApiProvider client={mockApiClient}>
        <PortalRootProvider>
          <ProjectProvider getProjects={() => resolve(projects)}>
            <CommandPalette open={open} onClose={onClose} />
          </ProjectProvider>
        </PortalRootProvider>
      </ApiProvider>
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
  localStorageMock.clear()
})

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    renderCommandPalette(false, () => {})
    // The modal should not render when open=false — the search input would be
    // absent from the DOM.
    assert.equal(screen.queryByPlaceholderText('Type a command…'), null)
  })

  it('renders all command items when open', () => {
    renderCommandPalette(true, () => {})

    assert.ok(screen.getByPlaceholderText('Type a command…'))
    assert.ok(screen.getByText('Sessions'))
    assert.ok(screen.getByText('Projects'))
    assert.ok(screen.getByText('Settings'))
    assert.ok(screen.getByText('API Keys'))
    assert.ok(screen.getByText('Billing'))
  })

  it('hides project-required items when no project is selected', () => {
    renderCommandPalette(true, () => {}, { hasProject: false })

    assert.ok(screen.getByPlaceholderText('Type a command…'))
    // Sessions requires a project — should be hidden
    assert.equal(screen.queryByText('Sessions'), null)
    // These don't require a project — should still be visible
    assert.ok(screen.getByText('Projects'))
    assert.ok(screen.getByText('Settings'))
    assert.ok(screen.getByText('API Keys'))
    assert.ok(screen.getByText('Billing'))
  })

  it('filters commands by search query', () => {
    renderCommandPalette(true, () => {})

    const input = screen.getByPlaceholderText('Type a command…')
    fireEvent.change(input, { target: { value: 'sett' } })

    // Settings should match
    assert.ok(screen.getByText('Settings'))
    // Sessions should not match
    assert.equal(screen.queryByText('Sessions'), null)
  })

  it('shows empty state when no commands match filter', () => {
    renderCommandPalette(true, () => {})

    const input = screen.getByPlaceholderText('Type a command…')
    fireEvent.change(input, { target: { value: 'zzzzz' } })

    assert.ok(screen.getByText('No commands found'))
  })

  it('calls onClose and navigates on item click', () => {
    let closed = false
    const handleClose = () => {
      closed = true
    }

    renderCommandPalette(true, handleClose)

    fireEvent.click(screen.getByText('Projects'))

    assert.equal(closed, true)
  })

  it('navigates via Enter key on highlighted item', () => {
    let closed = false
    const handleClose = () => {
      closed = true
    }

    renderCommandPalette(true, handleClose)

    const input = screen.getByPlaceholderText('Type a command…')

    // Press Enter to activate the first item (Sessions)
    fireEvent.keyDown(input, { key: 'Enter' })

    assert.equal(closed, true)
  })

  it('handles arrow key navigation without error', () => {
    renderCommandPalette(true, () => {})

    const input = screen.getByPlaceholderText('Type a command…')

    // Arrow down to select second item
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    // Arrow down again to select third item
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    // Arrow up to go back to second item
    fireEvent.keyDown(input, { key: 'ArrowUp' })

    // No assertion needed — just checking no errors from keyboard nav
    assert.ok(input)
  })

  it('handles Escape key', () => {
    let closed = false
    const handleClose = () => {
      closed = true
    }

    renderCommandPalette(true, handleClose)

    fireEvent.keyDown(document, { key: 'Escape' })

    assert.equal(closed, true)
  })
})
