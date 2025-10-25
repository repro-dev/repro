import { defaultClient, useApiClient } from '@repro/api-client'
import { FX } from '@repro/design'
import { done } from 'fluture'
import { Grid } from '@jsxstyle/react'
import { LoaderIcon } from 'lucide-react'
import React, {
  PropsWithChildren,
  createContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createState } from './createState'

export const AuthContext = createContext(
  createState({ apiClient: defaultClient })
)

export const AuthProvider: React.FC<PropsWithChildren<{}>> = ({ children }) => {
  const apiClient = useApiClient()
  const state = useMemo(() => createState({ apiClient }), [apiClient])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    return done(() => setLoading(false))(state.loadSession())
  }, [state, setLoading])

  return (
    <AuthContext.Provider value={state}>
      {loading && (
        <Grid
          height="100vh"
          width="100vw"
          alignItems="center"
          justifyItems="center"
        >
          <FX.Spin>
            <LoaderIcon />
          </FX.Spin>
        </Grid>
      )}

      {!loading && children}
    </AuthContext.Provider>
  )
}
