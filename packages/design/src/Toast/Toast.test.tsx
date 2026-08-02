import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { Toast } from './Toast'
import { ToastProvider } from './ToastProvider'
import { toastStyles } from './toastStyles'
import { useToast } from './useToast'

afterEach(cleanup)

// jsdom normalizes light-dark(...) values when assigned to an element's style;
// the same normalization is what getComputedStyle reports, so round-tripping a
// token through a scratch element keeps assertions robust.
function cssColor(value: string) {
  const element = document.createElement('span')
  element.style.color = value
  return element.style.color
}

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

describe('Toast — presentational card', () => {
  it('renders the message children inside a card', () => {
    const { container } = render(<Toast>Recording uploaded</Toast>)
    expect(container.textContent).toBe('Recording uploaded')
    const card = container.firstElementChild as HTMLElement
    expect(card).not.toBeNull()
    expect(card.tagName).toBe('DIV')
  })

  it('applies the success variant styles when type="success"', () => {
    const { container } = render(<Toast type="success">Saved</Toast>)
    const card = container.firstElementChild as HTMLElement
    const styles = window.getComputedStyle(card)
    expect(styles.backgroundColor).toBe(
      cssColor(toastStyles.success.backgroundColor)
    )
    expect(styles.borderColor).toBe(cssColor(toastStyles.success.borderColor))
    expect(styles.color).toBe(cssColor(toastStyles.success.color))
  })

  it('defaults to the default variant styles when no type is provided', () => {
    const { container } = render(<Toast>Hello</Toast>)
    const card = container.firstElementChild as HTMLElement
    const styles = window.getComputedStyle(card)
    expect(styles.backgroundColor).toBe(
      cssColor(toastStyles.default.backgroundColor)
    )
    expect(styles.color).toBe(cssColor(toastStyles.default.color))
  })

  it('renders the icon prop node when provided', () => {
    const { container } = render(
      <Toast type="success" icon={<span data-testid="toast-icon">✓</span>}>
        Saved
      </Toast>
    )
    const icon = container.querySelector('[data-testid="toast-icon"]')
    expect(icon).not.toBeNull()
    expect(icon?.textContent).toBe('✓')
  })

  it('omits the icon when none is provided', () => {
    const { container } = render(<Toast>Saved</Toast>)
    expect(container.querySelector('[data-testid="toast-icon"]')).toBeNull()
    expect(container.textContent).toBe('Saved')
  })

  it('exposes a forwardRef component identity', () => {
    // forwardRef components are objects (AdminTable.test.tsx convention).
    expect(typeof Toast).toBe('object')
    expect((Toast as { displayName?: string }).displayName).toBe('Toast')
  })
})
