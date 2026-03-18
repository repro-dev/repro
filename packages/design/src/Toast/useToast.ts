import { toast as sonnerToast } from 'sonner'

export type ToastOptions = {
  description?: string
  duration?: number
  id?: string | number
}

export function useToast() {
  return {
    success: (message: string, options?: ToastOptions) =>
      sonnerToast.success(message, options),
    error: (message: string, options?: ToastOptions) =>
      sonnerToast.error(message, options),
    warning: (message: string, options?: ToastOptions) =>
      sonnerToast.warning(message, options),
    info: (message: string, options?: ToastOptions) =>
      sonnerToast.info(message, options),
    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
    message: (message: string, options?: ToastOptions) =>
      sonnerToast(message, options),
  }
}

export { sonnerToast as toast }
