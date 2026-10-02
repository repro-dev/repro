import { RecordingMode } from '@repro/domain'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { Future, reject, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it } from 'node:test'
import React from 'react'
import { of, throwError } from 'rxjs'
import { TestScheduler } from 'rxjs/testing'
import {
  playback,
  resetCaptureModalTestState,
  restoreEnvironment,
  testState,
  uploadEnqueueCount,
  uploadProgress,
} from './CaptureModal.test-utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureUploadProvider, pollProgressWithBackoff, useCaptureUpload } =
  require('./CaptureUploadProvider') as typeof import('./CaptureUploadProvider')

describe('CaptureUploadProvider closed state', { concurrency: false }, () => {
  afterEach(() => {
    cleanup()
    resetCaptureModalTestState()
  })

  after(restoreEnvironment)

  it('clears settled enqueue errors and completed progress on close', async () => {
    let upload: ReturnType<typeof useCaptureUpload> | null = null
    const Probe = () => {
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
        <Probe />
      </CaptureUploadProvider>
    )
    const view = render(tree(true))

    testState.enqueueResponse = () => reject(new Error('enqueue failed'))
    act(() => upload!.enqueueUpload('project-1', 'Rejected report', ''))
    await waitFor(() => assert.ok(upload!.uploadState.error))
    view.rerender(tree(false))
    await waitFor(() =>
      assert.deepEqual(upload!.uploadState, {
        isUploading: false,
        progress: null,
        error: null,
        statusUnknown: false,
        uploadSource: null,
        uploadTitle: '',
        uploadRef: null,
        uploadProjectId: null,
      })
    )

    view.rerender(tree(true))
    testState.enqueueResponse = () => resolve('upload-ref-1')
    testState.progressResponse = () => uploadProgress(true)
    act(() => upload!.enqueueUpload('project-1', 'Completed report', ''))
    await waitFor(() => assert.equal(upload!.uploadState.isUploading, false))
    assert.equal(upload!.uploadState.progress?.completed, true)

    view.rerender(tree(false))
    await waitFor(() =>
      assert.deepEqual(upload!.uploadState, {
        isUploading: false,
        progress: null,
        error: null,
        statusUnknown: false,
        uploadSource: null,
        uploadTitle: '',
        uploadRef: null,
        uploadProjectId: null,
      })
    )
  })

  it('clears an enqueue error that settles after the modal closes', async () => {
    let upload: ReturnType<typeof useCaptureUpload> | null = null
    let rejectEnqueue: ((error: Error) => void) | null = null
    const Probe = () => {
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
        <Probe />
      </CaptureUploadProvider>
    )
    const view = render(tree(true))
    testState.enqueueResponse = () =>
      Future(rejectFuture => {
        rejectEnqueue = rejectFuture
        return () => {}
      })

    act(() => upload!.enqueueUpload('project-1', 'Pending report', ''))
    view.rerender(tree(false))
    assert.equal(upload!.uploadState.isUploading, true)
    act(() => rejectEnqueue!(new Error('enqueue failed after close')))

    await waitFor(() =>
      assert.deepEqual(upload!.uploadState, {
        isUploading: false,
        progress: null,
        error: null,
        statusUnknown: false,
        uploadSource: null,
        uploadTitle: '',
        uploadRef: null,
        uploadProjectId: null,
      })
    )
  })

  it('only permits same-source enqueue after upload status becomes unknown', async () => {
    for (const { source, alternateSource } of [
      { source: 'report', alternateSource: 'save-recording' },
      { source: 'save-recording', alternateSource: 'report' },
    ] as const) {
      testState.progressResponse = () => resolve(null)

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

      act(() =>
        upload!.enqueueUpload('project-1', 'Uncertain upload', '', source)
      )
      await waitFor(
        () => assert.equal(upload!.uploadState.statusUnknown, true),
        { timeout: 15_000 }
      )

      act(() =>
        upload!.enqueueUpload(
          'project-1',
          'Alternate upload',
          '',
          alternateSource
        )
      )
      assert.equal(uploadEnqueueCount(), 1)

      testState.progressResponse = () => uploadProgress(true)
      act(() =>
        upload!.enqueueUpload('project-1', 'Explicit retry', '', source)
      )
      await waitFor(() => assert.equal(upload!.uploadState.isUploading, false))
      assert.equal(uploadEnqueueCount(), 2)

      view.unmount()
      resetCaptureModalTestState()
    }
  })

  it('retries a null progress response until terminal progress without enqueueing twice', async () => {
    let progressPolls = 0
    testState.progressResponse = () => {
      progressPolls++
      if (progressPolls === 1) return resolve(null)
      return uploadProgress(progressPolls >= 3)
    }

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

    act(() => upload!.enqueueUpload('project-1', 'Null poll recovery', ''))
    await waitFor(() => assert.equal(upload!.uploadState.isUploading, false))

    assert.ok(progressPolls >= 3)
    assert.equal(upload!.uploadState.progress?.completed, true)
    assert.equal(uploadEnqueueCount(), 1)
    view.unmount()
  })

  it('stops after five consecutive null progress responses', () => {
    const scheduler = new TestScheduler(() => {})
    scheduler.maxFrames = 10_000
    let progressPolls = 0
    let pollError: unknown

    const subscription = pollProgressWithBackoff(() => {
      progressPolls++
      return of(null)
    }, scheduler).subscribe({ error: error => (pollError = error) })

    scheduler.flush()

    assert.equal(progressPolls, 5)
    assert.ok(pollError instanceof Error)
    assert.match(pollError.message, /status unknown/i)
    assert.equal(subscription.closed, true)
  })

  it('resets the null threshold after successful nonterminal progress', () => {
    const scheduler = new TestScheduler(() => {})
    scheduler.maxFrames = 10_000
    const responses = [
      null,
      null,
      null,
      null,
      { completed: false },
      null,
      null,
      null,
      null,
      { completed: true },
    ]
    const received: Array<{ completed: boolean }> = []
    let progressPolls = 0
    let pollError: unknown

    const subscription = pollProgressWithBackoff(() => {
      const response = responses[progressPolls++]
      return of(response === undefined ? { completed: true } : response)
    }, scheduler).subscribe({
      next: progress => received.push(progress),
      error: error => (pollError = error),
    })

    scheduler.flush()

    assert.equal(progressPolls, 10)
    assert.deepEqual(received, [{ completed: false }, { completed: true }])
    assert.equal(pollError, undefined)
    assert.equal(subscription.closed, true)
  })

  it('counts null responses across rejected polls without treating rejection as progress', () => {
    const scheduler = new TestScheduler(() => {})
    scheduler.maxFrames = 10_000
    let progressPolls = 0
    let pollError: unknown

    const subscription = pollProgressWithBackoff(() => {
      progressPolls++
      if (progressPolls <= 4) return of(null)
      if (progressPolls === 5) {
        return throwError(() => new Error('temporary status failure'))
      }
      return of(null)
    }, scheduler).subscribe({ error: error => (pollError = error) })

    scheduler.flush()

    assert.equal(progressPolls, 6)
    assert.ok(pollError instanceof Error)
    assert.match(pollError.message, /status unknown/i)
    assert.equal(subscription.closed, true)
  })
})
