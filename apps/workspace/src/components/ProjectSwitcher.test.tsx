import { ApiProvider, createApiClient } from '@repro/api-client'
import { PortalRootProvider } from '@repro/design'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectProvider } from '~/ProjectContext'
import { ProjectSwitcher } from './ProjectSwitcher'

afterEach(cleanup)

const localStorageMock = (() => {
  let store: Record<string, string> = {}

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

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const projects = [
  { id: 'project-1', name: 'Alpha' },
  { id: 'project-2', name: 'Beta' },
]

function renderProjectSwitcher() {
  render(
    <MemoryRouter>
      <ApiProvider client={apiClient}>
        <PortalRootProvider>
          <ProjectProvider getProjects={() => resolve(projects)}>
            <ProjectSwitcher />
          </ProjectProvider>
        </PortalRootProvider>
      </ApiProvider>
    </MemoryRouter>
  )
}

describe('ProjectSwitcher', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('renders a separator before the create project action button', async () => {
    renderProjectSwitcher()

    const trigger = await screen.findByRole('button', {
      name: /switch project\. current: alpha/i,
    })

    fireEvent.click(trigger)

    const separator = await screen.findByRole('separator')
    const createButton = screen.getByRole('button', { name: /create project/i })

    assert.equal(
      screen.queryByRole('menuitem', { name: /create project/i }),
      null
    )
    assert.ok(
      Boolean(
        separator.compareDocumentPosition(createButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    )
  })

  it('opens the create project dialog from the dropdown action button', async () => {
    renderProjectSwitcher()

    const trigger = await screen.findByRole('button', {
      name: /switch project\. current: alpha/i,
    })

    fireEvent.click(trigger)
    fireEvent.click(
      await screen.findByRole('button', { name: /create project/i })
    )

    await waitFor(() => {
      assert.ok(screen.getByRole('dialog', { name: /create project/i }))
    })
  })
})
