import React, { Fragment, PropsWithChildren } from 'react'
import { useSession } from './hooks'

export const UnlessSession: React.FC<PropsWithChildren> = ({ children }) => {
  return useSession() ? null : <Fragment>{children}</Fragment>
}
