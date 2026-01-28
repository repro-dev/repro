import { useApiClient } from '@repro/api-client'
import React, { useMemo } from 'react'
import { AgenticView } from './Agentic.view'
import { AgenticStateContext } from './context'
import { createAgenticState } from './createState'

export const Agentic: React.FC = () => {
  const apiClient = useApiClient()
  const state = useMemo(() => createAgenticState(apiClient), [apiClient])

  return (
    <AgenticStateContext.Provider value={state}>
      <AgenticView />
    </AgenticStateContext.Provider>
  )
}
