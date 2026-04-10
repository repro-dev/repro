import { ApiProvider, createApiClient } from '@repro/api-client'
import { Project } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { FutureInstance, never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectProvider } from '~/ProjectContext'
import { CreateProjectDialog } from './CreateProjectDialog'

afterEach(cleanup)

const apiClient = createApiClient({
  baseUrl: 'http://test',
  authStorage: 'memory',
})

const mockProject: Project = { id: 'project-new', name: 'New Project' }

describe('CreateProjectDialog', () => {
  describe('rendering', () => {
    it('renders modal with title when open=true', async () => {
      render(
        <MemoryRouter>
          <ApiProvider client={apiClient}>
            <ProjectProvider getProjects={() => resolve([])}>
              <CreateProjectDialog open={true} onClose={() => void 0} />
            </ProjectProvider>
          </ApiProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        assert.ok(screen.getByText('Create project'))
      })
    })

    it('does not render when open=false', async () => {
      render(
        <MemoryRouter>
          <ApiProvider client={apiClient}>
            <ProjectProvider getProjects={() => resolve([])}>
              <CreateProjectDialog open={false} onClose={() => void 0} />
            </ProjectProvider>
          </ApiProvider>
        </MemoryRouter>
      )

      // Modal with open=false should not be in DOM
      assert.equal(screen.queryByText('Create project'), null)
    })
  })

  describe('validation', () => {
    it('Create button is disabled when name is empty', async () => {
      render(
        <MemoryRouter>
          <ApiProvider client={apiClient}>
            <ProjectProvider getProjects={() => resolve([])}>
              <CreateProjectDialog open={true} onClose={() => void 0} />
            </ProjectProvider>
          </ApiProvider>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('Create project'))

      const createButton = screen.getByRole('button', { name: /create/i })
      assert.equal((createButton as HTMLButtonElement).disabled, true)
    })

    it('Create button is disabled when name exceeds 100 chars', async () => {
      render(
        <MemoryRouter>
          <ApiProvider client={apiClient}>
            <ProjectProvider getProjects={() => resolve([])}>
              <CreateProjectDialog open={true} onClose={() => void 0} />
            </ProjectProvider>
          </ApiProvider>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('Create project'))

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'a'.repeat(101) } })

      const createButton = screen.getByRole('button', { name: /create/i })
      assert.equal((createButton as HTMLButtonElement).disabled, true)
    })
  })

  describe('submission', () => {
    it('calls createProject with trimmed name on submit', async () => {
      const createProjectMock = mock.fn(() => resolve(mockProject))

      render(
        <MemoryRouter>
          <ApiProvider client={apiClient}>
            <ProjectProvider getProjects={() => resolve([])}>
              <CreateProjectDialog
                open={true}
                onClose={() => void 0}
                createProjectFn={createProjectMock}
              />
            </ProjectProvider>
          </ApiProvider>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('Create project'))

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: '  My Project  ' } })

      const createButton = screen.getByRole('button', { name: /create/i })
      await act(async () => {
        fireEvent.click(createButton)
      })

      await waitFor(() => {
        assert.equal(createProjectMock.mock.calls.length, 1)
        // arguments is typed as a tuple from the mock signature
        const args = createProjectMock.mock.calls[0]!.arguments as unknown[]
        assert.equal(args[1] as string, 'My Project')
      })
    })

    it('calls addProject and navigates to / on success', async () => {
      const addProjectSpy = mock.fn((_p: Project) => void 0)
      const navigateSpy = mock.fn((_path: string) => void 0)
      const onClose = mock.fn(() => void 0)
      const createProjectMock = mock.fn(() => resolve(mockProject))

      render(
        <MemoryRouter>
          <ApiProvider client={apiClient}>
            <ProjectProvider getProjects={() => resolve([])}>
              <CreateProjectDialog
                open={true}
                onClose={onClose}
                createProjectFn={createProjectMock}
                addProjectFn={addProjectSpy}
                navigateFn={navigateSpy}
              />
            </ProjectProvider>
          </ApiProvider>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('Create project'))

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'My Project' } })

      const createButton = screen.getByRole('button', { name: /create/i })
      await act(async () => {
        fireEvent.click(createButton)
      })

      await waitFor(() => {
        assert.equal(addProjectSpy.mock.calls.length, 1)
        assert.deepEqual(addProjectSpy.mock.calls[0]!.arguments[0], mockProject)
        assert.equal(navigateSpy.mock.calls[0]!.arguments[0], '/')
        assert.equal(onClose.mock.calls.length, 1)
      })
    })

    it('shows error message when API fails', async () => {
      const createProjectMock = mock.fn(() => reject(new Error('Server error')))

      render(
        <MemoryRouter>
          <ApiProvider client={apiClient}>
            <ProjectProvider getProjects={() => resolve([])}>
              <CreateProjectDialog
                open={true}
                onClose={() => void 0}
                createProjectFn={createProjectMock}
              />
            </ProjectProvider>
          </ApiProvider>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('Create project'))

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'My Project' } })

      const createButton = screen.getByRole('button', { name: /create/i })
      await act(async () => {
        fireEvent.click(createButton)
      })

      await waitFor(() => {
        assert.ok(screen.getByText(/failed to create project/i))
      })
    })

    it('disables buttons while submitting', async () => {
      // Use fluture's `never` to simulate an in-flight request that never settles
      const createProjectMock = mock.fn(
        (): FutureInstance<never, never> => never
      )

      render(
        <MemoryRouter>
          <ApiProvider client={apiClient}>
            <ProjectProvider getProjects={() => resolve([])}>
              <CreateProjectDialog
                open={true}
                onClose={() => void 0}
                createProjectFn={createProjectMock}
              />
            </ProjectProvider>
          </ApiProvider>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('Create project'))

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'My Project' } })

      const createButton = screen.getByRole('button', { name: /create/i })
      act(() => {
        fireEvent.click(createButton)
      })

      // After clicking, buttons should be disabled
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      assert.equal((createButton as HTMLButtonElement).disabled, true)
      assert.equal((cancelButton as HTMLButtonElement).disabled, true)
    })
  })

  describe('cancel', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const onClose = mock.fn(() => void 0)

      render(
        <MemoryRouter>
          <ApiProvider client={apiClient}>
            <ProjectProvider getProjects={() => resolve([])}>
              <CreateProjectDialog open={true} onClose={onClose} />
            </ProjectProvider>
          </ApiProvider>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('Create project'))

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      fireEvent.click(cancelButton)

      assert.equal(onClose.mock.calls.length, 1)
    })
  })
})
