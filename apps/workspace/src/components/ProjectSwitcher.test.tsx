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

const STORAGE_KEY = 'repro:selectedProjectId'

const defaultProjects = [
  { id: 'project-1', name: 'Alpha' },
  { id: 'project-2', name: 'Beta' },
]

function renderProjectSwitcher({
  projects = defaultProjects,
}: {
  projects?: { id: string; name: string }[]
} = {}) {
  render(
    <MemoryRouter>
      <PortalRootProvider>
        <ProjectProvider getProjects={() => resolve(projects)}>
          <ProjectSwitcher />
        </ProjectProvider>
      </PortalRootProvider>
    </MemoryRouter>
  )
}

describe('ProjectSwitcher', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('renders the zero-project create action as the project selector control', async () => {
    renderProjectSwitcher({ projects: [] })

    const createProjectButton = await screen.findByRole('button', {
      name: /^create project$/i,
    })

    assert.equal(createProjectButton.textContent, 'Create project')
    assert.ok(
      createProjectButton.querySelector('svg'),
      'Expected the zero-project selector action to keep the project icon treatment'
    )
    assert.equal(
      screen.getAllByRole('button', { name: /^create project$/i }).length,
      1
    )
    assert.equal(
      screen.queryByRole('button', { name: /switch project/i }),
      null
    )
  })

  it('opens the create project dialog from the zero-project action', async () => {
    renderProjectSwitcher({ projects: [] })

    fireEvent.click(
      await screen.findByRole('button', { name: /create project/i })
    )

    await waitFor(() => {
      assert.ok(screen.getByRole('dialog', { name: /create project/i }))
    })
  })

  it('renders the selected single project with a separate create action', async () => {
    localStorageMock.setItem(STORAGE_KEY, 'project-1')

    renderProjectSwitcher({
      projects: [{ id: 'project-1', name: 'Alpha' }],
    })

    assert.ok(
      await screen.findByRole('button', {
        name: /switch project\. current: alpha/i,
      })
    )
    assert.ok(screen.getByRole('button', { name: /create project/i }))
    assert.equal(
      screen.queryByRole('button', { name: /project settings/i }),
      null
    )
  })

  it('opens the create project dialog from the side action', async () => {
    localStorageMock.setItem(STORAGE_KEY, 'project-1')

    renderProjectSwitcher()

    fireEvent.click(
      await screen.findByRole('button', { name: /create project/i })
    )

    await waitFor(() => {
      assert.ok(screen.getByRole('dialog', { name: /create project/i }))
    })
  })

  it('opens the project menu from the selected project trigger', async () => {
    localStorageMock.setItem(STORAGE_KEY, 'project-1')

    renderProjectSwitcher()

    fireEvent.click(
      await screen.findByRole('button', {
        name: /switch project\. current: alpha/i,
      })
    )

    assert.ok(await screen.findByRole('menuitem', { name: /beta/i }))
    assert.equal(
      screen.getAllByRole('button', { name: /create project/i }).length,
      1
    )
  })
})
