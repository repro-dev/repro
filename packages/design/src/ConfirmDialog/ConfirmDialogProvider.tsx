import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useRef,
  useState,
} from 'react'
import { ConfirmDialog, ConfirmOptions } from './ConfirmDialog'

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmDialogContext = createContext<ConfirmContextValue | null>(
  null
)

type DialogState = {
  open: boolean
  options: ConfirmOptions
}

const defaultOptions: ConfirmOptions = {
  title: '',
}

export const ConfirmDialogProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const [state, setState] = useState<DialogState>({
    open: false,
    options: defaultOptions,
  })

  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    setState({ open: true, options })
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setState(s => ({ ...s, open: false }))
    resolveRef.current?.(true)
    resolveRef.current = null
  }, [])

  const handleCancel = useCallback(() => {
    setState(s => ({ ...s, open: false }))
    resolveRef.current?.(false)
    resolveRef.current = null
  }, [])

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      {state.open && (
        <ConfirmDialog
          open={state.open}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          {...state.options}
        />
      )}
    </ConfirmDialogContext.Provider>
  )
}

ConfirmDialogProvider.displayName = 'ConfirmDialogProvider'
