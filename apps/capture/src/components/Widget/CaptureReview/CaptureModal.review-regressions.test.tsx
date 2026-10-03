import { PortalRootProvider } from '@repro/design'
import { RecordingMode } from '@repro/domain'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { never, reject, resolve, type FutureInstance } from 'fluture'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it } from 'node:test'
import React from 'react'
import {
  enterReport,
  intents,
  playback,
  renderModal,
  resetCaptureModalTestState,
  restoreEnvironment,
  selectReportProject,
  testState,
  uploadEnqueueCount,
  uploadProgress,
} from './CaptureModal.test-utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureUploadProvider } =
  require('./CaptureUploadProvider') as typeof import('./CaptureUploadProvider')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureReview } =
  require('./CaptureReview') as typeof import('./CaptureReview')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SaveRecordingPopover } =
  require('./SaveRecordingPopover') as typeof import('./SaveRecordingPopover')

describe('CaptureModal review regressions', { concurrency: false }, () => {
  afterEach(() => {
    cleanup()
    resetCaptureModalTestState()
  })

  after(restoreEnvironment)

  const saveRecordingTree = (open: boolean) => (
    <PortalRootProvider>
      <CaptureUploadProvider
        open={open}
        playback={playback}
        recordingMode={RecordingMode.Snapshot}
        selectedDuration={60_000}
      >
        {open ? <SaveRecordingPopover isAuthed={true} /> : null}
      </CaptureUploadProvider>
    </PortalRootProvider>
  )

  const reportTree = (open: boolean) => (
    <PortalRootProvider>
      <CaptureUploadProvider
        open={open}
        playback={playback}
        recordingMode={RecordingMode.Snapshot}
        selectedDuration={60_000}
      >
        {open ? (
          <CaptureReview
            onClose={() => {}}
            playback={playback}
            recordingMode={RecordingMode.Snapshot}
            selectedDuration={60_000}
            setSelectedDuration={() => {}}
            privacyOverrides={{ maskedSelectors: [], ignoredSelectors: [] }}
          />
        ) : null}
      </CaptureUploadProvider>
    </PortalRootProvider>
  )

  it('restores a Save Recording title and project for retry after close and reopen', async () => {
    let progressPolls = 0
    testState.progressResponse = () => {
      progressPolls++
      return resolve(null)
    }

    const view = render(saveRecordingTree(true))
    fireEvent.click(screen.getByText('Save'))
    let popover = await screen.findByLabelText('Save recording')
    fireEvent.click(await within(popover).findByLabelText('Select project'))
    const projects = await screen.findAllByText('MVP Pilot')
    fireEvent.click(projects[projects.length - 1]!)
    fireEvent.input(
      within(popover).getByPlaceholderText('What did you record?'),
      { target: { value: 'Saved before unknown status' } }
    )
    fireEvent.click(within(popover).getByRole('button', { name: 'Save' }))

    await waitFor(
      () =>
        assert.ok(
          within(screen.getByLabelText('Save recording')).getByText(
            'The recording may already be in your project. Check before retrying; retrying anyway may create a duplicate.'
          )
        ),
      { timeout: 15_000 }
    )
    assert.equal(progressPolls, 5)
    view.rerender(saveRecordingTree(false))
    assert.equal(screen.queryByPlaceholderText('What did you record?'), null)
    view.rerender(saveRecordingTree(true))

    popover = await screen.findByLabelText('Save recording')
    const title = within(popover).getByPlaceholderText(
      'What did you record?'
    ) as HTMLInputElement
    assert.equal(title.value, 'Saved before unknown status')
    await waitFor(() =>
      assert.ok(
        within(popover)
          .getByLabelText('Select project')
          .textContent?.includes('MVP Pilot')
      )
    )
    const retry = within(popover).getByRole('button', {
      name: 'Retry save anyway',
    }) as HTMLButtonElement
    await waitFor(() => assert.equal(retry.disabled, false))

    testState.progressResponse = () => uploadProgress(true)
    fireEvent.click(retry)
    await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
    const retryIntent = intents.filter(
      intent => intent.type === 'upload:enqueue'
    )[1]
    assert.equal(retryIntent?.payload.projectId, 'project-1')
    assert.equal(retryIntent?.payload.title, 'Saved before unknown status')
  })

  it('does not reuse a failed report title for a separate Save Recording upload', async () => {
    testState.enqueueResponse = () => reject(new Error('network unavailable'))

    renderModal()
    await selectReportProject('MVP Pilot')
    enterReport('Report-only title', 'The report submission should fail.')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
    assert.ok(
      await screen.findByText(
        'Report could not be sent. Your connection may have dropped. Check it and select Retry report.'
      )
    )

    fireEvent.click(screen.getByText('Save'))
    const popover = await screen.findByLabelText('Save recording')
    const title = within(popover).getByPlaceholderText(
      'What did you record?'
    ) as HTMLInputElement
    assert.equal(title.value, '')
  })

  it('disables both report fields while enqueue acknowledgement is pending', async () => {
    testState.enqueueResponse = () => never as FutureInstance<unknown, unknown>

    renderModal()
    await selectReportProject('MVP Pilot')
    enterReport('Pending report', 'Do not edit while enqueue is pending.')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

    const title = screen.getByRole('textbox', {
      name: 'Title',
    }) as HTMLInputElement
    const description = screen.getByRole('textbox', {
      name: 'Description',
    }) as HTMLTextAreaElement
    await waitFor(() => {
      assert.equal(title.disabled, true)
      assert.equal(description.disabled, true)
    })
  })

  it('keeps both report fields disabled while upload progress is active', async () => {
    testState.progressResponse = () => never as FutureInstance<unknown, unknown>

    renderModal()
    await selectReportProject('MVP Pilot')
    enterReport('Active report', 'Do not edit while upload is active.')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
    await waitFor(() =>
      assert.ok(intents.some(intent => intent.type === 'upload:progress'))
    )

    assert.equal(
      (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
        .disabled,
      true
    )
    assert.equal(
      (
        screen.getByRole('textbox', {
          name: 'Description',
        }) as HTMLTextAreaElement
      ).disabled,
      true
    )
  })

  it('preserves the report and project drafts after project creation rejects', async () => {
    testState.fetchResponse = (path, options) => {
      if (path === '/projects' && options?.method === 'POST') {
        return reject(new Error('network unavailable'))
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
    fireEvent.click(await screen.findByText('Create new project…'))
    fireEvent.input(screen.getByPlaceholderText('Project name'), {
      target: { value: 'New destination' },
    })
    enterReport('Project retry report', 'Keep this description for retry.')
    const submit = screen.getByRole('button', {
      name: 'Create Bug Report',
    })
    fireEvent.click(submit)

    assert.ok(
      await screen.findByText('Failed to create project. Please try again.')
    )
    assert.equal(uploadEnqueueCount(), 0)
    assert.equal(
      (screen.getByPlaceholderText('Project name') as HTMLInputElement).value,
      'New destination'
    )
    assert.equal(
      (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
        .value,
      'Project retry report'
    )
    assert.equal(
      (
        screen.getByRole('textbox', {
          name: 'Description',
        }) as HTMLTextAreaElement
      ).value,
      'Keep this description for retry.'
    )

    testState.fetchResponse = (path, options) => {
      if (path === '/projects' && options?.method === 'POST') {
        return resolve({ id: 'project-new', name: 'New destination' })
      }
      return resolve({
        items: [{ id: 'project-new', name: 'New destination' }],
      })
    }
    fireEvent.click(submit)
    await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
    const reportIntent = intents.find(
      intent => intent.type === 'upload:enqueue'
    )
    assert.equal(reportIntent?.payload.projectId, 'project-new')
    assert.equal(reportIntent?.payload.title, 'Project retry report')
    assert.equal(
      reportIntent?.payload.description,
      'Keep this description for retry.'
    )
  })

  it('restores the original report project for retry after close and reopen', async () => {
    let progressPolls = 0
    testState.progressResponse = () => {
      progressPolls++
      return resolve(null)
    }

    const view = render(reportTree(true))
    await selectReportProject('MVP Pilot')
    enterReport('Report destination retry', 'Retry the original destination.')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
    await waitFor(
      () =>
        assert.ok(
          screen.getByText(
            'This report may already be in your project. Check before retrying to avoid a duplicate.'
          )
        ),
      { timeout: 15_000 }
    )
    assert.equal(progressPolls, 5)

    view.rerender(reportTree(false))
    assert.equal(screen.queryByRole('textbox', { name: 'Title' }), null)
    view.rerender(reportTree(true))

    const retry = screen.getByRole('button', {
      name: 'Retry report anyway',
    }) as HTMLButtonElement
    await waitFor(() => assert.equal(retry.disabled, false))
    assert.ok(
      screen.getByLabelText('Report project').textContent?.includes('MVP Pilot')
    )
    assert.equal(
      (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
        .value,
      'Report destination retry'
    )
    assert.equal(
      (
        screen.getByRole('textbox', {
          name: 'Description',
        }) as HTMLTextAreaElement
      ).value,
      'Retry the original destination.'
    )
    testState.progressResponse = () => uploadProgress(true)
    fireEvent.click(retry)
    await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
    const retryIntent = intents.filter(
      intent => intent.type === 'upload:enqueue'
    )[1]
    assert.equal(retryIntent?.payload.projectId, 'project-1')
  })
})
