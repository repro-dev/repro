import { RecordingMode } from '@repro/domain'
import { Playback } from '@repro/playback'
import { sliceEventsAtRange } from '@repro/recording'
import { toBinaryWireFormat } from '@repro/wire-formats'
import { useCallback } from 'react'

export interface SelectedRecording {
  events: ReturnType<Playback['getSourceEvents']>
  duration: number
  startTimeMs: number
  resourceMap: ReturnType<Playback['getResourceMap']>
}

export interface RecordingActions {
  getSelectedRecording(): SelectedRecording
  downloadLocally(): void
  isEmpty: boolean
}

export function useRecordingActions(
  playback: Playback,
  recordingMode: RecordingMode,
  selectedDuration: number
): RecordingActions {
  const getSelectedRecording = useCallback((): SelectedRecording => {
    const sourceEvents = playback.getSourceEvents()
    const playbackDuration = playback.getDuration()

    if (recordingMode === RecordingMode.Replay) {
      const maxTime = playbackDuration
      const minTime = Math.max(0, maxTime - selectedDuration)

      try {
        const { events, sourceOffset: startTimeMs } = sliceEventsAtRange(
          sourceEvents,
          [minTime, maxTime]
        )

        return {
          events,
          duration: maxTime - startTimeMs,
          startTimeMs,
          resourceMap: playback.getResourceMap(),
        }
      } catch {
        // sliceEventsAtRange throws when no leading snapshot exists — fall
        // back to full source events so Agentic/upload/download still work.
      }
    }

    return {
      events: sourceEvents,
      duration: playbackDuration,
      startTimeMs: 0,
      resourceMap: playback.getResourceMap(),
    }
  }, [playback, recordingMode, selectedDuration])

  const downloadLocally = useCallback(() => {
    const selected = getSelectedRecording()

    // Guard: bail if there are no events to download
    if (selected.events.size() === 0) {
      console.warn('downloadLocally: no events to download')
      return
    }

    const views = selected.events.toSource()

    let wireFormatBuffer: DataView
    try {
      wireFormatBuffer = toBinaryWireFormat(views)
    } catch (err) {
      console.warn('downloadLocally: failed to encode wire format', err)
      return
    }

    const blob = new Blob([wireFormatBuffer], {
      type: 'application/octet-stream',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `repro-recording-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.repro`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }, [getSelectedRecording])

  const isEmpty = playback.getSourceEvents().size() === 0

  return {
    getSelectedRecording,
    downloadLocally,
    isEmpty,
  }
}
