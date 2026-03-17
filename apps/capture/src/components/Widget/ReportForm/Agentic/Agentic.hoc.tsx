import { useApiClient } from '@repro/api-client'
import { usePlayback } from '@repro/playback'
import React, { useMemo } from 'react'
import { AgenticView } from './Agentic.view'
import { AgenticStateContext } from './context'
import { createAgenticState } from './createState'

export const Agentic: React.FC = () => {
  const apiClient = useApiClient()
  const playback = usePlayback()

  const state = useMemo(
    () => createAgenticState(apiClient, playback),
    [apiClient, playback]
  )

  return (
    <AgenticStateContext.Provider value={state}>
      <AgenticView />
    </AgenticStateContext.Provider>
  )
}
