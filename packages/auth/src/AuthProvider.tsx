import { defaultClient, useApiClient } from '@repro/api-client'
import { forget } from '@repro/future-utils'
import React, {
  PropsWithChildren,
  createContext,
  useEffect,
  useMemo,
} from 'react'
import { createState } from './createState'

export const AuthContext = createContext(
  createState({ apiClient: defaultClient })
)

export const AuthProvider: React.FC<PropsWithChildren<{ basePath?: string }>> = ({
  children,
  basePath,
}) => {
  const apiClient = useApiClient()
  const state = useMemo(
    () => createState({ apiClient, basePath }),
    [apiClient, basePath]
  )

  useEffect(() => {
    return forget(state.loadSession())
  }, [state])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
