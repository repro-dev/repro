import {
  act,
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
  modalTree,
  renderModal,
  resetCaptureModalTestState,
  restoreEnvironment,
  selectReportProject,
  sessionListeners,
  testState,
  uploadEnqueueCount,
  uploadProgress,
} from './CaptureModal.test-utils'

describe('CaptureModal unknown upload status', { concurrency: false }, () => {
  afterEach(() => {
    cleanup()
    resetCaptureModalTestState()
  })

  after(restoreEnvironment)

  it('warns and preserves the report until the user explicitly retries', async () => {
    let progressPolls = 0
    testState.progressResponse = () => {
      progressPolls++
      return resolve(null)
    }

    const view = renderModal()
    await selectReportProject('MVP Pilot')
    enterReport('Possibly submitted report', 'Keep these details for retry.')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

    await waitFor(
      () => {
        assert.ok(
          screen.getByText(
            'This report may already be in your project. Check before retrying to avoid a duplicate.'
          )
        )
      },
      { timeout: 15_000 }
    )

    assert.equal(progressPolls, 5)
    assert.equal(uploadEnqueueCount(), 1)
    assert.equal(
      (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
        .value,
      'Possibly submitted report'
    )
    assert.equal(
      (
        screen.getByRole('textbox', {
          name: 'Description',
        }) as HTMLTextAreaElement
      ).value,
      'Keep these details for retry.'
    )
    view.rerender(modalTree(false))
    view.rerender(modalTree(true))

    assert.ok(
      screen.getByText(
        'This report may already be in your project. Check before retrying to avoid a duplicate.'
      )
    )
    assert.equal(
      screen.queryByText(
        'The recording may already be in your project. Check before retrying; retrying anyway may create a duplicate.'
      ),
      null
    )
    assert.equal(
      (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
        .value,
      'Possibly submitted report'
    )
    assert.equal(
      (
        screen.getByRole('textbox', {
          name: 'Description',
        }) as HTMLTextAreaElement
      ).value,
      'Keep these details for retry.'
    )
    assert.ok(screen.getByRole('button', { name: 'Retry report anyway' }))
    assert.equal(uploadEnqueueCount(), 1)

    await selectReportProject('MVP Pilot')
    const retryReport = screen.getByRole('button', {
      name: 'Retry report anyway',
    }) as HTMLButtonElement
    await waitFor(() => assert.equal(retryReport.disabled, false))
    testState.progressResponse = () => uploadProgress(true)
    act(() => fireEvent.click(retryReport))

    await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
    assert.equal(progressPolls, 5)
  })

  it('blocks Save Recording while a report status is unknown', async () => {
    let progressPolls = 0
    testState.progressResponse = () => {
      progressPolls++
      return resolve(null)
    }

    renderModal()
    await selectReportProject('MVP Pilot')
    enterReport('Possibly submitted report', 'Keep these details for retry.')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

    await waitFor(() => assert.equal(progressPolls, 5), { timeout: 15_000 })

    fireEvent.click(screen.getByText('Save'))

    assert.equal(screen.queryByLabelText('Save recording'), null)
    assert.equal(uploadEnqueueCount(), 1)
    assert.equal(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled,
      true
    )
    assert.equal(
      (
        screen.getByRole('button', {
          name: 'Retry report anyway',
        }) as HTMLButtonElement
      ).disabled,
      false
    )
  })

  it('keeps Save Recording retries explicit and does not present them as report retries', async () => {
    let progressPolls = 0
    testState.progressResponse = () => {
      progressPolls++
      return resolve(null)
    }

    renderModal()
    fireEvent.click(screen.getByText('Save'))
    const popover = await screen.findByLabelText('Save recording')
    fireEvent.click(await within(popover).findByLabelText('Select project'))
    const projects = await screen.findAllByText('MVP Pilot')
    fireEvent.click(projects[projects.length - 1]!)
    fireEvent.input(
      within(popover).getByPlaceholderText('What did you record?'),
      {
        target: { value: 'Possibly saved recording' },
      }
    )
    fireEvent.click(within(popover).getByRole('button', { name: 'Save' }))

    await waitFor(
      () => {
        assert.equal(progressPolls, 5)
      },
      { timeout: 15_000 }
    )
    assert.equal(uploadEnqueueCount(), 1)
    const unknownPopover = await screen.findByLabelText('Save recording')
    assert.ok(
      within(unknownPopover).getByText(
        'The recording may already be in your project. Check before retrying; retrying anyway may create a duplicate.'
      )
    )
    assert.equal(
      screen.queryByText(
        'This report may already be in your project. Check before retrying to avoid a duplicate.'
      ),
      null
    )
    assert.equal(
      screen.queryByRole('button', { name: 'Retry report anyway' }),
      null
    )
    assert.equal(screen.queryByText(/Upload status is unknown/), null)
    assert.equal(
      screen.getAllByText(
        'The recording may already be in your project. Check before retrying; retrying anyway may create a duplicate.'
      ).length,
      1
    )

    testState.progressResponse = () => uploadProgress(true)
    assert.equal(
      (
        within(unknownPopover).getByPlaceholderText(
          'What did you record?'
        ) as HTMLInputElement
      ).value,
      'Possibly saved recording'
    )
    const retrySave = within(unknownPopover).getByRole('button', {
      name: 'Retry save anyway',
    })
    assert.equal(uploadEnqueueCount(), 1)

    await waitFor(() =>
      assert.equal((retrySave as HTMLButtonElement).disabled, false)
    )
    assert.ok(within(unknownPopover).getByText('MVP Pilot'))
    assert.equal(uploadEnqueueCount(), 1)
    fireEvent.click(retrySave)
    await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
  })

  it('blocks report submission while Save Recording status is unknown', async () => {
    let progressPolls = 0
    testState.progressResponse = () => {
      progressPolls++
      return resolve(null)
    }

    renderModal()
    await selectReportProject('MVP Pilot')
    enterReport(
      'Different report',
      'Do not submit while save status is unknown.'
    )
    fireEvent.click(screen.getByText('Save'))
    const popover = await screen.findByLabelText('Save recording')
    fireEvent.click(await within(popover).findByLabelText('Select project'))
    const projects = await screen.findAllByText('MVP Pilot')
    fireEvent.click(projects[projects.length - 1]!)
    fireEvent.input(
      within(popover).getByPlaceholderText('What did you record?'),
      { target: { value: 'Possibly saved recording' } }
    )
    fireEvent.click(within(popover).getByRole('button', { name: 'Save' }))

    await waitFor(() => assert.equal(progressPolls, 5), { timeout: 15_000 })

    const reportSubmit = screen.getByRole('button', {
      name: 'Create Bug Report',
    }) as HTMLButtonElement
    fireEvent.click(reportSubmit)
    fireEvent.submit(reportSubmit.closest('form')!)

    assert.equal(uploadEnqueueCount(), 1)
    assert.equal(reportSubmit.disabled, true)
    assert.equal(
      (
        within(await screen.findByLabelText('Save recording')).getByRole(
          'button',
          { name: 'Retry save anyway' }
        ) as HTMLButtonElement
      ).disabled,
      false
    )
  })

  it('keeps rejected Save Recording feedback and retry in its popover', async () => {
    let enqueueAttempts = 0
    testState.enqueueResponse = () =>
      ++enqueueAttempts === 1
        ? reject(new Error('enqueue failed'))
        : resolve('upload-ref-2')

    renderModal()
    fireEvent.click(screen.getByText('Save'))
    const popover = await screen.findByLabelText('Save recording')
    fireEvent.click(await within(popover).findByLabelText('Select project'))
    const projects = await screen.findAllByText('MVP Pilot')
    fireEvent.click(projects[projects.length - 1]!)
    fireEvent.input(
      within(popover).getByPlaceholderText('What did you record?'),
      {
        target: { value: 'Save retry title' },
      }
    )
    fireEvent.click(within(popover).getByRole('button', { name: 'Save' }))

    const failedPopover = await screen.findByLabelText('Save recording')
    assert.ok(
      await within(failedPopover).findByText(
        'Recording could not be saved. Your connection may have dropped. Check it and try again.'
      )
    )
    assert.equal(screen.queryByText(/Upload could not be started/i), null)
    assert.equal(
      (
        within(failedPopover).getByPlaceholderText(
          'What did you record?'
        ) as HTMLInputElement
      ).value,
      'Save retry title'
    )
    assert.equal(uploadEnqueueCount(), 1)
    assert.equal(screen.queryByRole('button', { name: 'Retry report' }), null)
    const retrySave = within(failedPopover).getByRole('button', {
      name: 'Retry save',
    }) as HTMLButtonElement
    assert.equal(retrySave.disabled, false)
    fireEvent.click(retrySave)
    await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
    const retryIntent = intents.filter(
      intent => intent.type === 'upload:enqueue'
    )[1]!
    assert.equal(retryIntent.payload.projectId, 'project-1')
    assert.equal(retryIntent.payload.title, 'Save retry title')
  })

  it('restores unknown report status when an explicit retry is rejected', async () => {
    let enqueueAttempts = 0
    testState.enqueueResponse = () =>
      ++enqueueAttempts === 1
        ? resolve('upload-ref-1')
        : reject(new Error('retry enqueue failed'))
    testState.progressResponse = () => resolve(null)

    renderModal()
    await selectReportProject('MVP Pilot')
    enterReport('Possibly submitted report', 'Keep these details after retry.')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
    const warning =
      'This report may already be in your project. Check before retrying to avoid a duplicate.'
    assert.ok(await screen.findByText(warning, {}, { timeout: 15_000 }))
    assert.equal(uploadEnqueueCount(), 1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry report anyway' }))

    assert.ok(
      await screen.findByText(
        'Report could not be sent. Your connection may have dropped. Check it and select Retry report.'
      )
    )
    assert.ok(screen.getByText(warning))
    assert.equal(uploadEnqueueCount(), 2)
    const retryIntent = intents.filter(
      intent => intent.type === 'upload:enqueue'
    )[1]!
    assert.equal(retryIntent.payload.projectId, 'project-1')
    assert.equal(retryIntent.payload.title, 'Possibly submitted report')
    assert.equal(
      retryIntent.payload.description,
      'Keep these details after retry.'
    )
    assert.equal(
      (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
        .value,
      'Possibly submitted report'
    )
    assert.equal(
      (
        screen.getByRole('textbox', {
          name: 'Description',
        }) as HTMLTextAreaElement
      ).value,
      'Keep these details after retry.'
    )
    assert.ok(
      screen.getByLabelText('Report project').textContent?.includes('MVP Pilot')
    )
    assert.equal(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled,
      true
    )

    testState.currentSession = { id: 'other-account' }
    act(() => [...sessionListeners].forEach(listener => listener()))
    assert.ok(screen.getByText(/This upload belongs to another account/))
    assert.equal(screen.queryByDisplayValue('Possibly submitted report'), null)

    testState.currentSession = { id: 'session-1' }
    act(() => [...sessionListeners].forEach(listener => listener()))
    assert.ok(await screen.findByText(warning))
    assert.ok(
      await screen.findByRole('button', { name: 'Retry report anyway' })
    )
    assert.equal(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled,
      true
    )
  })
})
