import { RecordingMode } from '@repro/domain'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { Future, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { after, afterEach, describe, it } from 'node:test'
import React from 'react'
import {
  playback,
  resetCaptureModalTestState,
  restoreEnvironment,
  sessionListeners,
  testState,
  uploadEnqueueCount,
} from './CaptureModal.test-utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CaptureUploadProvider, useCaptureUpload } =
  require('./CaptureUploadProvider') as typeof import('./CaptureUploadProvider')

type CaptureUpload = ReturnType<typeof useCaptureUpload>

async function createForeignPrincipalWithCompletedUpload() {
  let finishProgress: (() => void) | null = null
  let upload: CaptureUpload | null = null
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
  testState.enqueueResponse = () => resolve('owner-upload-ref')
  testState.progressResponse = () =>
    Future((_reject, resolveProgress) => {
      finishProgress = () =>
        resolveProgress({
          ref: 'owner-upload-ref',
          recordingId: 'recording-1',
          encryptionKey: null,
          stages: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 },
          completed: true,
          error: null,
        })
      return () => {}
    })

  act(() =>
    upload!.enqueueUpload(
      'project-1',
      'Owner completed title',
      'Owner completed description',
      'report'
    )
  )
  await waitFor(() =>
    assert.equal(upload!.uploadState.uploadRef, 'owner-upload-ref')
  )
  await waitFor(() => assert.equal(typeof finishProgress, 'function'))

  view.rerender(tree(false))
  act(() => finishProgress!())
  await waitFor(() => {
    assert.equal(upload!.uploadState.progress?.completed, true)
    assert.equal(upload!.uploadState.isUploading, false)
  })

  act(() => {
    testState.currentSession = { id: 'session-2' }
    sessionListeners.forEach(listener => listener())
  })
  view.rerender(tree(true))

  return { upload: upload!, view }
}

function assertOwnerCompletion(upload: CaptureUpload) {
  assert.equal(upload.uploadPrincipalId, 'session-1')
  assert.equal(upload.uploadState.isUploading, false)
  assert.equal(upload.uploadState.progress?.completed, true)
  assert.equal(upload.uploadState.error, null)
  assert.equal(upload.uploadState.statusUnknown, false)
  assert.equal(upload.uploadState.uploadSource, 'report')
  assert.equal(upload.uploadState.uploadTitle, 'Owner completed title')
  assert.equal(upload.uploadState.uploadProjectId, 'project-1')
}

describe(
  'CaptureUploadProvider foreign-principal closed result',
  { concurrency: false },
  () => {
    afterEach(() => {
      cleanup()
      resetCaptureModalTestState()
    })

    after(restoreEnvironment)

    it('retains the owner’s failed report when another principal opens and closes', async () => {
      let rejectEnqueue: ((error: Error) => void) | null = null
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
      testState.enqueueResponse = () =>
        Future(rejectFuture => {
          rejectEnqueue = rejectFuture
          return () => {}
        })

      act(() => {
        upload!.setReportDraft({
          title: 'Owner draft title',
          description: 'Owner draft description',
        })
        upload!.enqueueUpload(
          'project-1',
          'Owner upload title',
          'Owner draft description',
          'report'
        )
      })
      view.rerender(tree(false))
      assert.equal(upload!.uploadState.isUploading, true)
      act(() => rejectEnqueue!(new Error('owner enqueue failed')))
      await waitFor(() => assert.equal(upload!.uploadState.isUploading, false))

      act(() => {
        testState.currentSession = { id: 'session-2' }
        sessionListeners.forEach(listener => listener())
      })
      view.rerender(tree(true))
      assert.equal(upload!.uploadPrincipalId, 'session-1')
      view.rerender(tree(false))

      act(() => {
        testState.currentSession = { id: 'session-1' }
        sessionListeners.forEach(listener => listener())
      })
      view.rerender(tree(true))

      await waitFor(() => {
        assert.equal(upload!.uploadPrincipalId, 'session-1')
        assert.equal(upload!.uploadState.error?.message, 'owner enqueue failed')
        assert.equal(upload!.uploadState.uploadSource, 'report')
        assert.equal(upload!.uploadState.uploadTitle, 'Owner upload title')
        assert.equal(upload!.uploadState.uploadProjectId, 'project-1')
        assert.deepEqual(upload!.reportDraft, {
          title: 'Owner draft title',
          description: 'Owner draft description',
        })
      })
    })

    it('rejects a foreign report reservation for a retained completed upload', async () => {
      const { upload } = await createForeignPrincipalWithCompletedUpload()
      assertOwnerCompletion(upload)

      let reservationId: number | null = null
      act(() => {
        reservationId = upload.reserveUpload('report')
      })

      assert.equal(reservationId, null)
      assert.equal(uploadEnqueueCount(), 1)
      assertOwnerCompletion(upload)
    })

    it('rejects a foreign save-recording reservation for a retained completed upload', async () => {
      const { upload } = await createForeignPrincipalWithCompletedUpload()
      assertOwnerCompletion(upload)

      let reservationId: number | null = null
      act(() => {
        reservationId = upload.reserveUpload('save-recording')
      })

      assert.equal(reservationId, null)
      assert.equal(uploadEnqueueCount(), 1)
      assertOwnerCompletion(upload)
    })

    it('rejects direct foreign report enqueue for a retained completed upload', async () => {
      const { upload } = await createForeignPrincipalWithCompletedUpload()
      assertOwnerCompletion(upload)

      let enqueued = true
      act(() => {
        enqueued = upload.enqueueUpload(
          'project-2',
          'Foreign report title',
          '',
          'report'
        )
      })

      assert.equal(enqueued, false)
      assert.equal(uploadEnqueueCount(), 1)
      assertOwnerCompletion(upload)
    })

    it('rejects direct foreign save-recording enqueue for a retained completed upload', async () => {
      const { upload } = await createForeignPrincipalWithCompletedUpload()
      assertOwnerCompletion(upload)

      let enqueued = true
      act(() => {
        enqueued = upload.enqueueUpload(
          'project-2',
          'Foreign save title',
          '',
          'save-recording'
        )
      })

      assert.equal(enqueued, false)
      assert.equal(uploadEnqueueCount(), 1)
      assertOwnerCompletion(upload)
    })
  }
)
