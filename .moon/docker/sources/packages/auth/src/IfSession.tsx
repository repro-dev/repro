import React, { Fragment, PropsWithChildren } from 'react'
import { useSession } from './hooks'

export const IfSession: React.FC<PropsWithChildren> = ({ children }) => {
  return useSession() ? <Fragment>{children}</Fragment> : null
}
