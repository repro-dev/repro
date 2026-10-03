import { RecordingMode } from '@repro/domain'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { type FutureInstance, never, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it } from 'node:test'
import React from 'react'
import { finalize, map, of, throwError, timer } from 'rxjs'
import { TestScheduler } from 'rxjs/testing'
import {
  enterReport,
  intents,
  playback,
  refreshSession,
  renderModal,
  resetCaptureModalTestState,
  restoreEnvironment,
  selectReportProject,
  testState,
  uploadEnqueueCount,
  uploadProgress,
} from './CaptureModal.test-utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureUploadProvider, pollProgressWithBackoff, useCaptureUpload } =
  require('./CaptureUploadProvider') as typeof import('./CaptureUploadProvider')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useProjectCatalog } =
  require('./ProjectSelection') as typeof import('./ProjectSelection')

describe('CaptureModal resilience', { concurrency: false }, () => {
  afterEach(() => {
    cleanup()
    resetCaptureModalTestState()
  })

  after(restoreEnvironment)

  it('preserves loaded projects when a catalog refresh fails', async () => {
    const { result } = renderHook(() => useProjectCatalog(true))
    await waitFor(() => assert.equal(result.current.projectsLoading, false))
    assert.deepEqual(
      result.current.projects.map(({ id, name }) => ({ id, name })),
      [
        { id: 'project-1', name: 'MVP Pilot' },
        { id: 'project-2', name: 'Other Project' },
      ]
    )

    testState.fetchResponse = () => reject(new Error('network unavailable'))
    act(() => result.current.refetchProjects())
    await waitFor(() => assert.equal(result.current.projectsError, true))
    assert.deepEqual(
      result.current.projects.map(({ id, name }) => ({ id, name })),
      [
        { id: 'project-1', name: 'MVP Pilot' },
        { id: 'project-2', name: 'Other Project' },
      ]
    )
  })

  it('keeps a pending enqueue owned across close and reopen', () => {
    testState.enqueueResponse = () => never as FutureInstance<unknown, unknown>
    let upload: ReturnType<typeof useCaptureUpload> | null = null
    const CaptureUploadProbe = () => {
      upload = useCaptureUpload()
      return null
    }
    const tree = (open: boolean) => (
      <CaptureUploadProvider
        open={open}
        playback={playback}
        recordingMode={RecordingMode.Snapshot}
        selectedDuration={60_000}
      >
        <CaptureUploadProbe />
      </CaptureUploadProvider>
    )
    const view = render(tree(true))

    act(() => upload!.enqueueUpload('project-1', 'First report', ''))
    act(() => upload!.enqueueUpload('project-1', 'Duplicate report', ''))
    assert.equal(uploadEnqueueCount(), 1)
    assert.equal(upload!.uploadState.isUploading, true)

    view.rerender(tree(false))
    view.rerender(tree(true))
    act(() => upload!.enqueueUpload('project-1', 'After reopen', ''))
    assert.equal(uploadEnqueueCount(), 1)
    assert.equal(upload!.uploadState.isUploading, true)
  })

  it('keeps an acknowledged upload and polling active across close and reopen', async () => {
    let pollCount = 0
    let completeUpload = false
    testState.progressResponse = () => {
      pollCount++
      return uploadProgress(completeUpload)
    }
    let upload: ReturnType<typeof useCaptureUpload> | null = null
    const CaptureUploadProbe = () => {
      upload = useCaptureUpload()
      return null
    }
    const tree = (open: boolean) => (
      <CaptureUploadProvider
        open={open}
        playback={playback}
        recordingMode={RecordingMode.Snapshot}
        selectedDuration={60_000}
      >
        <CaptureUploadProbe />
      </CaptureUploadProvider>
    )
    const view = render(tree(true))

    act(() => upload!.enqueueUpload('project-1', 'Active report', ''))
    await waitFor(() => assert.ok(pollCount > 0))
    assert.equal(upload!.uploadState.isUploading, true)

    const pollsBeforeClose = pollCount
    view.rerender(tree(false))
    await waitFor(() => assert.ok(pollCount > pollsBeforeClose))
    assert.equal(upload!.uploadState.isUploading, true)

    view.rerender(tree(true))
    act(() => upload!.enqueueUpload('project-1', 'Duplicate report', ''))
    assert.equal(uploadEnqueueCount(), 1)
    assert.equal(upload!.uploadState.isUploading, true)

    completeUpload = true
    await waitFor(() => assert.equal(upload!.uploadState.isUploading, false))
    act(() => upload!.enqueueUpload('project-1', 'After completion', ''))
    assert.equal(uploadEnqueueCount(), 2)
  })

  it('recovers after a rejected progress poll and stays locked until completion', async () => {
    let pollCount = 0
    let completeUpload = false
    testState.progressResponse = () => {
      pollCount++
      if (pollCount <= 2) return reject(new Error('temporary status failure'))
      return uploadProgress(completeUpload)
    }

    renderModal()
    await selectReportProject('MVP Pilot')
    enterReport('Poll recovery', 'Keep this report locked while uploading.')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bug Report' }))
    await waitFor(() => assert.ok(pollCount >= 3))

    const submit = screen.getByRole('button', {
      name: 'Create Bug Report',
    }) as HTMLButtonElement
    assert.equal(submit.disabled, true)
    fireEvent.submit(submit.closest('form')!)
    assert.equal(uploadEnqueueCount(), 1)

    completeUpload = true
    await waitFor(() => assert.equal(submit.disabled, false))
    assert.equal(uploadEnqueueCount(), 1)
  })

  it('backs off rejected status polls exponentially up to a bounded delay', () => {
    const scheduler = new TestScheduler(() => {})
    scheduler.maxFrames = 12_000
    const pollTimes: number[] = []
    let pollCount = 0
    const subscription = pollProgressWithBackoff(() => {
      pollTimes.push(scheduler.now())
      pollCount++
      return pollCount <= 6
        ? throwError(() => new Error('temporary status failure'))
        : of({ completed: true })
    }, scheduler).subscribe()

    scheduler.flush()

    assert.deepEqual(pollTimes, [0, 250, 750, 1_750, 3_750, 7_750, 11_750])
    assert.equal(subscription.closed, true)
  })

  it('keeps delayed progress polls sequential', () => {
    const scheduler = new TestScheduler(() => {})
    scheduler.maxFrames = 1_000
    let activePolls = 0
    let maxConcurrentPolls = 0
    let pollCount = 0

    pollProgressWithBackoff(() => {
      activePolls++
      pollCount++
      maxConcurrentPolls = Math.max(maxConcurrentPolls, activePolls)
      return timer(100, scheduler).pipe(
        map(() => ({ completed: pollCount === 3 })),
        finalize(() => activePolls--)
      )
    }, scheduler).subscribe()

    scheduler.flush()

    assert.equal(pollCount, 3)
    assert.equal(maxConcurrentPolls, 1)
    assert.equal(activePolls, 0)
  })

  it('clears a report project removed after a failed catalog refresh', async () => {
    let catalogFetches = 0
    testState.fetchResponse = path => {
      if (path !== '/projects') return resolve('upload-ref-1')
      catalogFetches++
      if (catalogFetches === 2) return reject(new Error('network unavailable'))
      return resolve({
        items:
          catalogFetches < 3
            ? [
                { id: 'project-1', name: 'MVP Pilot' },
                { id: 'project-2', name: 'Other Project' },
              ]
            : [{ id: 'project-2', name: 'Other Project' }],
      })
    }
    renderModal()
    await selectReportProject('MVP Pilot')
    enterReport(
      'Stale project',
      'Keep the report until a valid project is selected.'
    )

    act(refreshSession)
    assert.ok(
      await screen.findByText(
        'Projects could not be loaded. Check your connection and try again.'
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => assert.equal(catalogFetches, 3))
    const submit = screen.getByRole('button', {
      name: 'Create Bug Report',
    }) as HTMLButtonElement
    await waitFor(() => assert.equal(submit.disabled, true))
    fireEvent.submit(submit.closest('form')!)
    assert.equal(uploadEnqueueCount(), 0)

    await selectReportProject('Other Project')
    fireEvent.click(submit)
    await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
    assert.equal(
      intents.find(intent => intent.type === 'upload:enqueue')?.payload
        .projectId,
      'project-2'
    )
  })

  it('blocks a Save Recording choice removed after a failed catalog refresh', async () => {
    let catalogFetches = 0
    testState.fetchResponse = path => {
      if (path !== '/projects') return resolve('upload-ref-1')
      catalogFetches++
      if (catalogFetches === 3 || catalogFetches === 4) {
        return reject(new Error('network unavailable'))
      }
      return resolve({
        items:
          catalogFetches < 5
            ? [
                { id: 'project-1', name: 'MVP Pilot' },
                { id: 'project-2', name: 'Other Project' },
              ]
            : [{ id: 'project-2', name: 'Other Project' }],
      })
    }
    renderModal()
    fireEvent.click(screen.getByText('Save'))
    const popover = await screen.findByLabelText('Save recording')
    const select = await within(popover).findByLabelText('Select project')
    fireEvent.click(select)
    const initialOptions = await screen.findAllByText('MVP Pilot')
    fireEvent.click(initialOptions[initialOptions.length - 1]!)
    fireEvent.input(
      within(popover).getByPlaceholderText('What did you record?'),
      {
        target: { value: 'Saved recording' },
      }
    )

    act(refreshSession)
    assert.ok(
      await within(popover).findByText(
        'Projects could not be loaded. Check your connection and try again.'
      )
    )
    fireEvent.click(within(popover).getByRole('button', { name: 'Retry' }))
    await waitFor(() => assert.equal(catalogFetches, 5))
    const save = within(popover).getByRole('button', {
      name: 'Save',
    }) as HTMLButtonElement
    await waitFor(() => assert.equal(save.disabled, true))
    fireEvent.click(save)
    assert.equal(uploadEnqueueCount(), 0)

    fireEvent.click(await within(popover).findByLabelText('Select project'))
    const refreshedOptions = await screen.findAllByText('Other Project')
    fireEvent.click(refreshedOptions[refreshedOptions.length - 1]!)
    fireEvent.click(save)
    await waitFor(() => assert.equal(uploadEnqueueCount(), 1))
    assert.equal(
      intents.find(intent => intent.type === 'upload:enqueue')?.payload
        .projectId,
      'project-2'
    )
  })
})
