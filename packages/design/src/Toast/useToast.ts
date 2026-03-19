import { toast as sonnerToast } from 'sonner'
import { toastStyles } from './toastStyles'

export type ToastOptions = {
  description?: string
  duration?: number
  id?: string | number
  action?: { label: string; onClick: () => void }
}

function buildOptions(style: Record<string, string>, options?: ToastOptions) {
  return {
    style,
    description: options?.description,
    duration: options?.duration,
    id: options?.id,
    action: options?.action
      ? { label: options.action.label, onClick: options.action.onClick }
      : undefined,
  }
}

export function useToast() {
  return {
    success: (message: string, options?: ToastOptions) =>
      sonnerToast.success(message, buildOptions(toastStyles.success, options)),
    error: (message: string, options?: ToastOptions) =>
      sonnerToast.error(message, buildOptions(toastStyles.error, options)),
    warning: (message: string, options?: ToastOptions) =>
      sonnerToast.warning(message, buildOptions(toastStyles.warning, options)),
    info: (message: string, options?: ToastOptions) =>
      sonnerToast.info(message, buildOptions(toastStyles.info, options)),
    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
    message: (message: string, options?: ToastOptions) =>
      sonnerToast(message, buildOptions(toastStyles.default, options)),
  }
}

export { sonnerToast as toast }
