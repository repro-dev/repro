import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { reject, resolve } from 'fluture'
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

const projectCreationError = 'Failed to create project. Please try again.'

describe(
  'CaptureModal project reservation failure matrix',
  { concurrency: false },
  () => {
    afterEach(() => {
      cleanup()
      resetCaptureModalTestState()
    })

    after(restoreEnvironment)

    it('releases a report reservation after a synchronous project-create throw', async () => {
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          throw new Error('report project creation threw')
        }
        return resolve({
          items: [{ id: 'save-project', name: 'Save destination' }],
        })
      }

      renderModal()
      fireEvent.click(await screen.findByLabelText('Report project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(screen.getByPlaceholderText('Project name'), {
        target: { value: 'Failed report project' },
      })
      enterReport('Failed report title', 'Failed report description')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

      assert.ok(await screen.findByText(projectCreationError))
      assert.equal(screen.queryByLabelText('Save recording'), null)

      const saveTrigger = screen.getAllByText('Save')[0]!.closest('button')!
      assert.equal((saveTrigger as HTMLButtonElement).disabled, false)
      fireEvent.click(saveTrigger)
      const savePopover = await screen.findByLabelText('Save recording')
      assert.equal(within(savePopover).queryByText(projectCreationError), null)
      fireEvent.click(within(savePopover).getByLabelText('Select project'))
      fireEvent.click(await screen.findByText('Save destination'))
      fireEvent.input(
        within(savePopover).getByPlaceholderText('What did you record?'),
        { target: { value: 'Save sibling title' } }
      )

      const saveSubmit = within(savePopover).getByRole('button', {
        name: 'Save',
      }) as HTMLButtonElement
      assert.equal(saveSubmit.disabled, false)
      fireEvent.click(saveSubmit)

      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      const saveIntent = intents.find(
        intent => intent.type === 'upload:enqueue'
      )!
      assert.equal(saveIntent.payload.projectId, 'save-project')
      assert.equal(saveIntent.payload.title, 'Save sibling title')
      assert.equal(saveIntent.payload.description, null)
      assert.notEqual(saveIntent.payload.title, 'Failed report title')
      assert.equal(uploadEnqueueCount(), 1)
    })

    it('releases a Save Recording reservation after project creation rejects', async () => {
      testState.fetchResponse = (path, options) => {
        if (path === '/projects' && options?.method === 'POST') {
          return reject(new Error('save project creation rejected'))
        }
        return resolve({
          items: [{ id: 'report-project', name: 'Report destination' }],
        })
      }

      renderModal()
      fireEvent.click(screen.getAllByText('Save')[0]!)
      const savePopover = await screen.findByLabelText('Save recording')
      fireEvent.click(within(savePopover).getByLabelText('Select project'))
      fireEvent.click(await screen.findByText('Create new project…'))
      fireEvent.input(
        within(savePopover).getByPlaceholderText('Project name'),
        {
          target: { value: 'Failed save project' },
        }
      )
      fireEvent.input(
        within(savePopover).getByPlaceholderText('What did you record?'),
        { target: { value: 'Failed save title' } }
      )
      fireEvent.click(within(savePopover).getByRole('button', { name: 'Save' }))

      assert.ok(await within(savePopover).findByText(projectCreationError))
      await selectReportProject('Report destination')
      fireEvent.input(screen.getByPlaceholderText('What is the bug?'), {
        target: { value: 'Report sibling title' },
      })
      fireEvent.input(screen.getByRole('textbox', { name: 'Description' }), {
        target: { value: 'Report sibling description' },
      })

      const reportSubmit = screen.getByRole('button', {
        name: 'Create Bug Report',
      }) as HTMLButtonElement
      assert.equal(reportSubmit.disabled, false)
      assert.equal(
        within(reportSubmit.closest('form')!).queryByText(projectCreationError),
        null
      )
      fireEvent.click(reportSubmit)

      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      const reportIntent = intents.find(
        intent => intent.type === 'upload:enqueue'
      )!
      assert.equal(reportIntent.payload.projectId, 'report-project')
      assert.equal(reportIntent.payload.title, 'Report sibling title')
      assert.equal(
        reportIntent.payload.description,
        'Report sibling description'
      )
      assert.notEqual(reportIntent.payload.title, 'Failed save title')
      assert.equal(uploadEnqueueCount(), 1)
    })
  }
)
