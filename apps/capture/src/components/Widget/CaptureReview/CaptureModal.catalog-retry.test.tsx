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

describe('CaptureModal project catalog retry', { concurrency: false }, () => {
  afterEach(() => {
    cleanup()
    resetCaptureModalTestState()
  })

  after(restoreEnvironment)

  it('shows catalog failures in both selectors and blocks uploads until retry', async () => {
    let catalogFetches = 0
    testState.fetchResponse = (path, options) => {
      if (path === '/projects' && !options?.method) {
        catalogFetches++
        if (catalogFetches === 1 || catalogFetches === 3) {
          return reject(new Error('network unavailable'))
        }
      }
      return resolve({
        items: [
          { id: 'project-1', name: 'MVP Pilot' },
          { id: 'project-2', name: 'Other Project' },
        ],
      })
    }

    renderModal()
    const errorMessage =
      'Projects could not be loaded. Check your connection and try again.'
    assert.ok(await screen.findByText(errorMessage))
    assert.equal(screen.queryByPlaceholderText('Project name'), null)

    const reportSubmit = screen.getByRole('button', {
      name: 'Create Bug Report',
    }) as HTMLButtonElement
    assert.equal(reportSubmit.disabled, true)
    assert.equal(
      (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
        .disabled,
      false
    )
    assert.equal(
      (
        screen.getByRole('textbox', {
          name: 'Description',
        }) as HTMLTextAreaElement
      ).disabled,
      false
    )
    enterReport('Catalog failure', 'Retry the project list first.')
    fireEvent.submit(reportSubmit.closest('form')!)
    assert.equal(uploadEnqueueCount(), 0)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => assert.equal(catalogFetches, 2))
    await waitFor(() =>
      assert.equal(
        (screen.getByLabelText('Report project') as HTMLSelectElement).disabled,
        false
      )
    )
    await selectReportProject('MVP Pilot')
    const retrySubmit = screen.getByRole('button', {
      name: 'Create Bug Report',
    }) as HTMLButtonElement
    assert.equal(retrySubmit.disabled, false)
    fireEvent.click(retrySubmit)
    await waitFor(() => assert.equal(uploadEnqueueCount(), 1))

    fireEvent.click(screen.getByText('Save'))
    const savePopover = await screen.findByLabelText('Save recording')
    assert.ok(await within(savePopover).findByText(errorMessage))
    assert.equal(
      within(savePopover).queryByPlaceholderText('Project name'),
      null
    )
    const saveButton = within(savePopover).getByRole('button', {
      name: 'Save',
    }) as HTMLButtonElement
    assert.equal(saveButton.disabled, true)
    fireEvent.click(saveButton)
    assert.equal(uploadEnqueueCount(), 1)

    fireEvent.click(within(savePopover).getByRole('button', { name: 'Retry' }))
    fireEvent.click(await within(savePopover).findByLabelText('Select project'))
    const projectOptions = await screen.findAllByText('MVP Pilot')
    fireEvent.click(projectOptions[projectOptions.length - 1]!)
    fireEvent.input(
      within(savePopover).getByPlaceholderText('What did you record?'),
      { target: { value: 'Saved recording' } }
    )
    fireEvent.click(saveButton)
    await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
    const savedRecordingIntent = intents.filter(
      intent => intent.type === 'upload:enqueue'
    )[1]
    assert.ok(savedRecordingIntent)
    assert.equal(savedRecordingIntent.payload.projectId, 'project-1')
    assert.equal(savedRecordingIntent.payload.title, 'Saved recording')
    assert.equal(savedRecordingIntent.payload.description, null)
  })
})
