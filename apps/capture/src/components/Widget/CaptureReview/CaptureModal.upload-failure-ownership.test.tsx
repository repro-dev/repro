import { RecordingMode } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { reject, resolve } from 'fluture'
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
} from './CaptureModal.test-utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureUploadProvider, useCaptureUpload } =
  require('./CaptureUploadProvider') as typeof import('./CaptureUploadProvider')

const REPORT_BLOCKED_BY_SAVE_ERROR =
  'Wait for or retry Save Recording before submitting this report.'
const SAVE_BLOCKED_BY_REPORT_ERROR =
  'Wait for or retry the report before saving this recording.'

async function selectSaveProject(popover: HTMLElement) {
  fireEvent.click(within(popover).getByLabelText('Select project'))
  const projects = await screen.findAllByText('MVP Pilot')
  fireEvent.click(projects[projects.length - 1]!)
}

describe(
  'CaptureModal upload failure ownership',
  { concurrency: false },
  () => {
    afterEach(() => {
      cleanup()
      resetCaptureModalTestState()
    })

    after(restoreEnvironment)

    it('keeps a Save Recording enqueue failure when Report is submitted', async () => {
      testState.enqueueResponse = () => reject(new Error('save enqueue failed'))
      renderModal()
      await selectReportProject('MVP Pilot')
      enterReport('Unsent report title', 'Keep this report draft.')

      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      let popover = await screen.findByLabelText('Save recording')
      await selectSaveProject(popover)
      fireEvent.input(
        within(popover).getByPlaceholderText('What did you record?'),
        {
          target: { value: 'Failed save title' },
        }
      )
      fireEvent.click(within(popover).getByRole('button', { name: 'Save' }))

      assert.ok(
        await screen.findByText(
          'Recording could not be saved. Your connection may have dropped. Check it and try again.'
        )
      )
      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      assert.ok(screen.getByText(REPORT_BLOCKED_BY_SAVE_ERROR))
      assert.equal(
        (
          screen.getByRole('button', {
            name: 'Create Bug Report',
          }) as HTMLButtonElement
        ).disabled,
        true
      )
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
      assert.equal(uploadEnqueueCount(), 1)

      popover = screen.getByLabelText('Save recording')
      assert.equal(
        (
          within(popover).getByPlaceholderText(
            'What did you record?'
          ) as HTMLInputElement
        ).value,
        'Failed save title'
      )
      assert.ok(within(popover).getByText('MVP Pilot'))
      const retrySave = within(popover).getByRole('button', {
        name: 'Retry save',
      })
      assert.equal((retrySave as HTMLButtonElement).disabled, false)
      assert.equal(
        (screen.getByPlaceholderText('What is the bug?') as HTMLInputElement)
          .value,
        'Unsent report title'
      )
      assert.equal(
        (
          screen.getByRole('textbox', {
            name: 'Description',
          }) as HTMLTextAreaElement
        ).value,
        'Keep this report draft.'
      )

      testState.enqueueResponse = () => resolve('retry-save-ref')
      fireEvent.click(retrySave)
      await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
      const retryIntent = intents.filter(
        intent => intent.type === 'upload:enqueue'
      )[1]!
      assert.equal(retryIntent.payload.projectId, 'project-1')
      assert.equal(retryIntent.payload.title, 'Failed save title')
    })

    it('keeps a report enqueue failure when Save Recording is attempted', async () => {
      testState.enqueueResponse = () =>
        reject(new Error('report enqueue failed'))
      renderModal()
      await selectReportProject('MVP Pilot')
      enterReport('Failed report title', 'Keep this report description.')
      fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))

      assert.ok(
        await screen.findByText(
          'Report could not be sent. Your connection may have dropped. Check it and select Retry report.'
        )
      )
      await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
      const retryReport = screen.getByRole('button', { name: 'Retry report' })
      assert.equal((retryReport as HTMLButtonElement).disabled, false)

      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      const popover = await screen.findByLabelText('Save recording')
      assert.ok(within(popover).getByText(SAVE_BLOCKED_BY_REPORT_ERROR))
      const save = within(popover).getByRole('button', { name: 'Save' })
      assert.equal((save as HTMLButtonElement).disabled, true)
      fireEvent.click(save)
      assert.equal(uploadEnqueueCount(), 1)

      assert.equal(
        (screen.getByPlaceholderText('What is the bug?') as HTMLInputElement)
          .value,
        'Failed report title'
      )
      assert.equal(
        (
          screen.getByRole('textbox', {
            name: 'Description',
          }) as HTMLTextAreaElement
        ).value,
        'Keep this report description.'
      )
      assert.ok(
        screen.getByText(
          'Report could not be sent. Your connection may have dropped. Check it and select Retry report.'
        )
      )

      testState.enqueueResponse = () => resolve('retry-report-ref')
      fireEvent.click(retryReport)
      await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
      const retryIntent = intents.filter(
        intent => intent.type === 'upload:enqueue'
      )[1]!
      assert.equal(retryIntent.payload.projectId, 'project-1')
      assert.equal(retryIntent.payload.title, 'Failed report title')
      assert.equal(
        retryIntent.payload.description,
        'Keep this report description.'
      )
    })

    it('logs only non-sensitive enqueue diagnostics', () => {
      let upload: ReturnType<typeof useCaptureUpload> | null = null
      const Probe = () => {
        upload = useCaptureUpload()
        return null
      }
      const view = render(
        <CaptureUploadProvider
          open={true}
          playback={playback}
          recordingMode={RecordingMode.Snapshot}
          selectedDuration={60_000}
        >
          <Probe />
        </CaptureUploadProvider>
      )
      const originalLog = console.log
      const logs: Array<Array<unknown>> = []

      try {
        console.log = (...args: Array<unknown>) => logs.push(args)
        act(() =>
          upload!.enqueueUpload(
            'private-project-id',
            'Private report title',
            'Private report details'
          )
        )
        assert.deepEqual(
          logs.find(
            ([message]) => message === '[capture] enqueueUpload called'
          ),
          [
            '[capture] enqueueUpload called',
            { recordingMode: RecordingMode.Snapshot },
          ]
        )
      } finally {
        console.log = originalLog
        view.unmount()
      }
    })

    it('guards alternate-source reservations and enqueues but permits source retries', async () => {
      for (const { source, alternateSource } of [
        { source: 'report', alternateSource: 'save-recording' },
        { source: 'save-recording', alternateSource: 'report' },
      ] as const) {
        cleanup()
        resetCaptureModalTestState()

        let upload: ReturnType<typeof useCaptureUpload> | null = null
        const Probe = () => {
          upload = useCaptureUpload()
          return null
        }
        const view = render(
          <CaptureUploadProvider
            open={true}
            playback={playback}
            recordingMode={RecordingMode.Snapshot}
            selectedDuration={60_000}
          >
            <Probe />
          </CaptureUploadProvider>
        )
        testState.enqueueResponse = () => reject(new Error(`${source} failed`))

        act(() =>
          assert.equal(
            upload!.enqueueUpload('project-1', 'Original title', '', source),
            true
          )
        )
        await waitFor(() =>
          assert.equal(upload!.uploadState.error?.message, `${source} failed`)
        )

        assert.equal(upload!.reserveUpload(alternateSource), null)
        assert.equal(
          upload!.enqueueUpload(
            'project-2',
            'Sibling title',
            '',
            alternateSource
          ),
          false
        )
        assert.equal(uploadEnqueueCount(), 1)
        assert.equal(upload!.uploadState.uploadSource, source)
        assert.equal(upload!.uploadState.uploadTitle, 'Original title')
        assert.equal(upload!.uploadState.uploadProjectId, 'project-1')

        const sameSourceReservation = upload!.reserveUpload(source)
        assert.notEqual(sameSourceReservation, null)
        act(() => upload!.releaseUploadReservation(sameSourceReservation!))
        testState.enqueueResponse = () => resolve('retry-ref')
        act(() =>
          assert.equal(
            upload!.enqueueUpload('project-1', 'Original title', '', source),
            true
          )
        )
        await waitFor(() => assert.equal(uploadEnqueueCount(), 2))
        view.unmount()
      }
    })
  }
)
