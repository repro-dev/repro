import { PortalRootProvider } from '@repro/design'
import { RecordingMode } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { Future, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it } from 'node:test'
import React from 'react'
import {
  enterReport,
  intents,
  playback,
  resetCaptureModalTestState,
  restoreEnvironment,
  selectReportProject,
  testState,
  uploadEnqueueCount,
} from './CaptureModal.test-utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureUploadProvider } =
  require('./CaptureUploadProvider') as typeof import('./CaptureUploadProvider')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureReview } =
  require('./CaptureReview') as typeof import('./CaptureReview')

const ControlledCaptureReview = () => {
  const [open, setOpen] = React.useState(true)
  const [selectedDuration, setSelectedDuration] = React.useState(60_000)
  return (
    <>
      <button type="button" onClick={() => setOpen(false)}>
        Close capture modal
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen capture modal
      </button>
      <PortalRootProvider>
        <CaptureUploadProvider
          open={open}
          playback={playback}
          recordingMode={RecordingMode.Snapshot}
          selectedDuration={selectedDuration}
        >
          {open && (
            <CaptureReview
              onClose={() => setOpen(false)}
              playback={playback}
              recordingMode={RecordingMode.Snapshot}
              selectedDuration={selectedDuration}
              setSelectedDuration={setSelectedDuration}
              privacyOverrides={{ maskedSelectors: [], ignoredSelectors: [] }}
            />
          )}
        </CaptureUploadProvider>
      </PortalRootProvider>
    </>
  )
}

describe(
  'CaptureModal late report enqueue failure',
  { concurrency: false },
  () => {
    afterEach(() => {
      cleanup()
      resetCaptureModalTestState()
    })

    after(restoreEnvironment)

    it('restores report project and retry details after failure while closed', async () => {
      let rejectEnqueue: ((error: Error) => void) | null = null
      testState.enqueueResponse = () =>
        Future(rejectFuture => {
          rejectEnqueue = rejectFuture
          return () => {}
        })

      render(<ControlledCaptureReview />)
      await selectReportProject('MVP Pilot')
      enterReport('Closed modal report', 'Retain this report description.')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      await waitFor(() => assert.equal(typeof rejectEnqueue, 'function'))

      fireEvent.click(
        screen.getByRole('button', { name: 'Close capture modal' })
      )
      await waitFor(() =>
        assert.equal(screen.queryByRole('textbox', { name: 'Title' }), null)
      )
      act(() => rejectEnqueue!(new Error('report failed while closed')))

      fireEvent.click(
        screen.getByRole('button', { name: 'Reopen capture modal' })
      )
      await screen.findByRole('textbox', { name: 'Title' })
      await waitFor(() => {
        assert.equal(
          (screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement)
            .value,
          'Closed modal report'
        )
        assert.equal(
          (
            screen.getByRole('textbox', {
              name: 'Description',
            }) as HTMLTextAreaElement
          ).value,
          'Retain this report description.'
        )
        assert.match(
          screen.getByLabelText('Report project').textContent ?? '',
          /MVP Pilot/
        )
        assert.equal(
          (
            screen.getByRole('button', {
              name: 'Retry report',
            }) as HTMLButtonElement
          ).disabled,
          false
        )
      })

      testState.enqueueResponse = () => resolve('report-retry-ref')
      fireEvent.click(screen.getByRole('button', { name: 'Retry report' }))
      await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
      const retryIntent = intents.filter(
        intent => intent.type === 'upload:enqueue'
      )[1]!
      assert.equal(retryIntent.payload.projectId, 'project-1')
      assert.equal(retryIntent.payload.title, 'Closed modal report')
      assert.equal(
        retryIntent.payload.description,
        'Retain this report description.'
      )
    })
  }
)
