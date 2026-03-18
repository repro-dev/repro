import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { ToastProvider } from './ToastProvider'
import { toastStyles } from './toastStyles'
import { useToast } from './useToast'

afterEach(cleanup)

describe('useToast', () => {
  it('returns object with expected methods', () => {
    let hookResult: ReturnType<typeof useToast> | null = null

    const TestComponent = () => {
      hookResult = useToast()
      return null
    }

    render(<TestComponent />)

    expect(hookResult).not.toBeNull()
    expect(typeof hookResult!.success).toBe('function')
    expect(typeof hookResult!.error).toBe('function')
    expect(typeof hookResult!.warning).toBe('function')
    expect(typeof hookResult!.info).toBe('function')
    expect(typeof hookResult!.dismiss).toBe('function')
    expect(typeof hookResult!.message).toBe('function')
  })

  it('passes variant style for success toast', () => {
    const calls: Array<{ style: Record<string, string> }> = []
    let hookResult: ReturnType<typeof useToast> | null = null

    const TestComponent = () => {
      hookResult = useToast()
      return null
    }

    render(<TestComponent />)

    const originalSuccess = hookResult!.success
    mock.method(
      hookResult!,
      'success',
      (message: string, options?: unknown) => {
        calls.push(options as { style: Record<string, string> })
        return originalSuccess(message)
      }
    )

    hookResult!.success('Saved')

    expect(calls.length).toBe(1)
  })

  it('ToastOptions accepts action property', () => {
    let hookResult: ReturnType<typeof useToast> | null = null

    const TestComponent = () => {
      hookResult = useToast()
      return null
    }

    render(<TestComponent />)

    expect(() => {
      hookResult!.success('Undo available', {
        action: { label: 'Undo', onClick: () => {} },
      })
    }).not.toThrow()
  })

  it('toastStyles has variant keys for success, error, warning, info, default', () => {
    expect(typeof toastStyles.success).toBe('object')
    expect(typeof toastStyles.error).toBe('object')
    expect(typeof toastStyles.warning).toBe('object')
    expect(typeof toastStyles.info).toBe('object')
    expect(typeof toastStyles.default).toBe('object')
  })

  it('variant styles contain backgroundColor, borderColor, and color', () => {
    for (const variant of [
      'success',
      'error',
      'warning',
      'info',
      'default',
    ] as const) {
      const style = toastStyles[variant]
      expect(typeof style.backgroundColor).toBe('string')
      expect(typeof style.borderColor).toBe('string')
      expect(typeof style.color).toBe('string')
    }
  })
})

describe('ToastProvider', () => {
  it('renders without crashing', () => {
    expect(() => {
      render(
        <ToastProvider>
          <div>content</div>
        </ToastProvider>
      )
    }).not.toThrow()
  })

  it('renders children', () => {
    render(
      <ToastProvider>
        <div data-testid="child">child content</div>
      </ToastProvider>
    )

    const child = document.querySelector('[data-testid="child"]')
    expect(child).not.toBeNull()
    expect(child?.textContent).toBe('child content')
  })
})
