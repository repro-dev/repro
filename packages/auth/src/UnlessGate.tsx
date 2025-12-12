import React, { Fragment, PropsWithChildren } from 'react'
import { useHasGate } from './hooks'

interface UnlessGateProps {
  gate: string
}

export const UnlessGate: React.FC<PropsWithChildren<UnlessGateProps>> = ({
  children,
  gate,
}) => {
  return useHasGate(gate) ? null : <Fragment>{children}</Fragment>
}
