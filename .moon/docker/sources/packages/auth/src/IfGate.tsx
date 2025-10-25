import React, { Fragment, PropsWithChildren } from 'react'
import { useHasGate } from './hooks'

interface IfGateProps {
  gate: string
}

export const IfGate: React.FC<PropsWithChildren<IfGateProps>> = ({
  children,
  gate,
}) => {
  return useHasGate(gate) ? <Fragment>{children}</Fragment> : null
}
