import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { ToastProvider } from './ToastProvider'
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
