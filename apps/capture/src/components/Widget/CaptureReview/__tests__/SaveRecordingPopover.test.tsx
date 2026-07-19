import { cleanup, render } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, before, describe, it, mock } from 'node:test'
import React from 'react'

/**
 * Test that CaptureUploadProvider exposes a resetUploadState function
 * that clears upload state back to initial values.
 */

// Mock @repro/messaging so CaptureUploadProvider mounts without error
mock.module('@repro/messaging', {
  namedExports: {
    useMessaging: () => null,
  },
})

let CaptureUploadProvider: React.FC<{
  children: React.ReactNode
  playback: any
  recordingMode: any
  selectedDuration: number
  open: boolean
}>
let useCaptureUpload: () => {
  uploadState: {
    isUploading: boolean
    progress: unknown
    error: Error | null
    uploadRef: string | null
    uploadProjectId: string | null
  }
  enqueueUpload: (
    projectId: string,
    title: string,
    description: string | null
  ) => void
  resetUploadState: () => void
}

describe('CaptureUploadProvider', () => {
  before(async () => {
    const mod = await import('../CaptureUploadProvider')
    CaptureUploadProvider = mod.CaptureUploadProvider
    useCaptureUpload = mod.useCaptureUpload
  })

  afterEach(() => {
    cleanup()
  })

  it('exposes resetUploadState from the context', () => {
    let capturedReset: undefined | (() => void) = undefined

    function Harness() {
      const { resetUploadState } = useCaptureUpload()
      capturedReset = resetUploadState
      return null
    }

    render(
      <CaptureUploadProvider
        playback={null as any}
        recordingMode={null as any}
        selectedDuration={0}
        open={true}
      >
        <Harness />
      </CaptureUploadProvider>
    )

    assert.equal(typeof capturedReset, 'function')
  })

  it('resetUploadState clears upload state back to initial values', () => {
    let capturedReset: undefined | (() => void) = undefined
    let capturedState: any = undefined

    function Harness() {
      const { uploadState, resetUploadState } = useCaptureUpload()
      capturedReset = resetUploadState
      capturedState = uploadState
      return null
    }

    render(
      <CaptureUploadProvider
        playback={null as any}
        recordingMode={null as any}
        selectedDuration={0}
        open={true}
      >
        <Harness />
      </CaptureUploadProvider>
    )

    // Initial state should be clean
    assert.equal(capturedState.isUploading, false)
    assert.equal(capturedState.progress, null)
    assert.equal(capturedState.error, null)
    assert.equal(capturedState.uploadRef, null)
    assert.equal(capturedState.uploadProjectId, null)

    // Call resetUploadState — it should not throw and state should stay clean
    capturedReset!()
    assert.equal(capturedState.isUploading, false)
    assert.equal(capturedState.progress, null)
  })
})
