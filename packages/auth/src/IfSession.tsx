import React, { Fragment, PropsWithChildren } from 'react'
import { useSession, useSessionLoading } from './hooks'

export const IfSession: React.FC<PropsWithChildren> = ({ children }) => {
  const session = useSession()
  const loading = useSessionLoading()

  if (loading || !session) {
    return null
  }

  return <Fragment>{children}</Fragment>
}
