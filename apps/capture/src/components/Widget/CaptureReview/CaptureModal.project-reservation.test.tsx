import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { Future, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it } from 'node:test'
import {
  enterReport,
  intents,
  renderModal,
  resetCaptureModalTestState,
  restoreEnvironment,
  selectReportProject,
  testState,
  uploadEnqueueCount,
} from './CaptureModal.test-utils'

describe(
  'CaptureModal cross-surface upload reservation',
  { concurrency: false },
  () => {
    afterEach(() => {
      cleanup()
      resetCaptureModalTestState()
    })

    after(restoreEnvironment)

    it('blocks Save Recording while a report project is being created', async () => {
      let finishProject:
        | ((project: { id: string; name: string }) => void)
        | null = null
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          return Future((_, resolveProject) => {
            finishProject = project => resolveProject(project)
            return () => {}
          })
        }
        return resolve({
          items: [
            { id: 'project-1', name: 'MVP Pilot' },
            { id: 'project-2', name: 'Other Project' },
          ],
        })
      }

      renderModal()
      fireEvent.click(screen.getByText('Save'))
      const savePopover = await screen.findByLabelText('Save recording')
      fireEvent.click(within(savePopover).getByLabelText('Select project'))
      const saveProjects = await screen.findAllByText('MVP Pilot')
      fireEvent.click(saveProjects[saveProjects.length - 1]!)
      fireEvent.input(
        within(savePopover).getByPlaceholderText('What did you record?'),
        { target: { value: 'Sibling save must wait' } }
      )

      fireEvent.click(await screen.findByLabelText('Report project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(screen.getByPlaceholderText('Project name'), {
        target: { value: 'Report destination' },
      })
      fireEvent.input(screen.getByPlaceholderText('What is the bug?'), {
        target: { value: 'Pending report title' },
      })
      fireEvent.input(screen.getByRole('textbox', { name: 'Description' }), {
        target: { value: 'Report description' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
      await waitFor(() => assert.equal(typeof finishProject, 'function'))

      assert.equal(
        (screen.getAllByText('Save')[0]!.closest('button') as HTMLButtonElement)
          .disabled,
        true
      )
      assert.equal(
        (
          within(savePopover).getByRole('button', {
            name: 'Save',
          }) as HTMLButtonElement
        ).disabled,
        true
      )
      assert.ok(
        within(savePopover).getByText(
          'A report is preparing an upload. Wait for it to finish before saving this recording.'
        )
      )
      fireEvent.click(within(savePopover).getByRole('button', { name: 'Save' }))
      assert.equal(uploadEnqueueCount(), 0)

      finishProject!({
        id: 'created-report-project',
        name: 'Report destination',
      })
      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      const reportIntent = intents.find(
        intent => intent.type === 'upload:enqueue'
      )!
      assert.equal(reportIntent.payload.projectId, 'created-report-project')
      assert.equal(reportIntent.payload.title, 'Pending report title')
      assert.equal(reportIntent.payload.description, 'Report description')
    })

    it('blocks report submission while a Save Recording project is being created', async () => {
      let finishProject:
        | ((project: { id: string; name: string }) => void)
        | null = null
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          return Future((_, resolveProject) => {
            finishProject = project => resolveProject(project)
            return () => {}
          })
        }
        return resolve({
          items: [
            { id: 'project-1', name: 'MVP Pilot' },
            { id: 'project-2', name: 'Other Project' },
          ],
        })
      }

      renderModal()
      fireEvent.click(await screen.findByLabelText('Report project'))
      const reportProjects = await screen.findAllByText('MVP Pilot')
      fireEvent.click(reportProjects[reportProjects.length - 1]!)
      enterReport('Sibling report must wait', 'Report details')

      fireEvent.click(screen.getByText('Save'))
      const savePopover = await screen.findByLabelText('Save recording')
      fireEvent.click(within(savePopover).getByLabelText('Select project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(
        within(savePopover).getByPlaceholderText('Project name'),
        {
          target: { value: 'Save destination' },
        }
      )
      fireEvent.input(
        within(savePopover).getByPlaceholderText('What did you record?'),
        { target: { value: 'Pending save title' } }
      )
      fireEvent.click(within(savePopover).getByRole('button', { name: 'Save' }))
      await waitFor(() => assert.equal(typeof finishProject, 'function'))

      const reportSubmit = screen.getByRole('button', {
        name: 'Create Bug Report',
      }) as HTMLButtonElement
      assert.equal(reportSubmit.disabled, true)
      assert.ok(
        screen.getByText(
          'Save Recording is preparing an upload. Wait for it to finish before submitting this report.'
        )
      )
      assert.equal(uploadEnqueueCount(), 0)
      fireEvent.submit(reportSubmit.closest('form')!)
      assert.equal(uploadEnqueueCount(), 0)

      finishProject!({ id: 'created-save-project', name: 'Save destination' })
      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      const saveIntent = intents.find(
        intent => intent.type === 'upload:enqueue'
      )!
      assert.equal(saveIntent.payload.projectId, 'created-save-project')
      assert.equal(saveIntent.payload.title, 'Pending save title')
      assert.equal(saveIntent.payload.description, null)
    })

    it('releases the report reservation when project creation rejects', async () => {
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          return reject(new Error('project creation failed'))
        }
        return resolve({ items: [{ id: 'project-1', name: 'MVP Pilot' }] })
      }

      renderModal()
      fireEvent.click(await screen.findByLabelText('Report project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(screen.getByPlaceholderText('Project name'), {
        target: { value: 'Failed destination' },
      })
      enterReport('Report after rejection', 'Details')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
      assert.ok(
        await screen.findByText('Failed to create project. Please try again.')
      )

      assert.equal(
        (screen.getAllByText('Save')[0]!.closest('button') as HTMLButtonElement)
          .disabled,
        false
      )
      fireEvent.click(screen.getAllByText('Save')[0]!)
      const savePopover = await screen.findByLabelText('Save recording')
      fireEvent.click(within(savePopover).getByLabelText('Select project'))
      fireEvent.click(await screen.findByText('MVP Pilot'))
      fireEvent.input(
        within(savePopover).getByPlaceholderText('What did you record?'),
        { target: { value: 'Save after rejection' } }
      )
      fireEvent.click(within(savePopover).getByRole('button', { name: 'Save' }))
      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      assert.equal(
        intents.find(intent => intent.type === 'upload:enqueue')?.payload.title,
        'Save after rejection'
      )
    })

    it('releases the Save Recording reservation when project creation throws', async () => {
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          throw new Error('project creation threw')
        }
        return resolve({ items: [{ id: 'project-1', name: 'MVP Pilot' }] })
      }

      renderModal()
      await selectReportProject('MVP Pilot')
      enterReport('Report after throw', 'Details')
      fireEvent.click(screen.getByText('Save'))
      const savePopover = await screen.findByLabelText('Save recording')
      fireEvent.click(within(savePopover).getByLabelText('Select project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(
        within(savePopover).getByPlaceholderText('Project name'),
        {
          target: { value: 'Throwing destination' },
        }
      )
      fireEvent.input(
        within(savePopover).getByPlaceholderText('What did you record?'),
        { target: { value: 'Failed save title' } }
      )
      fireEvent.click(within(savePopover).getByRole('button', { name: 'Save' }))
      assert.ok(
        await within(savePopover).findByText(
          'Failed to create project. Please try again.'
        )
      )

      const reportSubmit = screen.getByRole('button', {
        name: 'Create Bug Report',
      }) as HTMLButtonElement
      assert.equal(reportSubmit.disabled, false)
      fireEvent.click(reportSubmit)
      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      assert.equal(
        intents.find(intent => intent.type === 'upload:enqueue')?.payload.title,
        'Report after throw'
      )
    })
  }
)
