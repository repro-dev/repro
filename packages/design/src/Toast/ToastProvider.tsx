import React, { PropsWithChildren } from 'react'
import { Toaster } from 'sonner'
import { TOAST_GAP, TOAST_OFFSET, toastStyles } from './toastStyles'

type ToasterPosition =
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center'

type Props = PropsWithChildren<{
  position?: ToasterPosition
  duration?: number
}>

export const ToastProvider: React.FC<Props> = ({
  children,
  position = 'bottom-right',
  duration = 4000,
}) => {
  return (
    <>
      <Toaster
        position={position}
        duration={duration}
        closeButton
        offset={TOAST_OFFSET}
        gap={TOAST_GAP}
        toastOptions={{ style: { ...toastStyles.base } }}
      />
      {children}
    </>
  )
}

ToastProvider.displayName = 'ToastProvider'
