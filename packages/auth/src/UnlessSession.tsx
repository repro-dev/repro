import React, { Fragment, PropsWithChildren } from 'react'
import { useSession, useSessionLoading } from './hooks'

export const UnlessSession: React.FC<PropsWithChildren> = ({ children }) => {
  const session = useSession()
  const loading = useSessionLoading()

  if (loading || session) {
    return null
  }

  return <Fragment>{children}</Fragment>
}
