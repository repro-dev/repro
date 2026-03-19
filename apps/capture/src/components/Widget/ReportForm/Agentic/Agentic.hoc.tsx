import { useApiClient } from '@repro/api-client'
import { usePlayback } from '@repro/playback'
import React, { useMemo } from 'react'
import { AgenticView } from './Agentic.view'
import { AgenticStateContext } from './context'
import { createAgenticState } from './createState'
import { RecordingDataAccessor } from './types'

export const Agentic: React.FC = () => {
  const apiClient = useApiClient()
  const playback = usePlayback()

  const recording = useMemo<RecordingDataAccessor>(
    () => ({
      getSourceEvents: () => playback.getSourceEvents(),
      getDuration: () => playback.getDuration(),
      getSnapshotAtTime: timestampMs => {
        const copy = playback.copy()
        copy.seekToTime(timestampMs)
        return copy.getSnapshot()
      },
    }),
    [playback]
  )

  const state = useMemo(
    () => createAgenticState(apiClient, recording),
    [apiClient, recording]
  )

  return (
    <AgenticStateContext.Provider value={state}>
      <AgenticView />
    </AgenticStateContext.Provider>
  )
}
