import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { ErrorBoundary } from './ErrorBoundary'

afterEach(cleanup)

/**
 * Helper: a component that throws during render.
 */
function ThrowError({ message }: { message: string }) {
  throw new Error(message)
}

/**
 * Helper: a component that only throws during render,
 * not in event handlers.
 */
function SafeChild() {
  return <div>Safe content</div>
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <SafeChild />
      </ErrorBoundary>
    )

    expect(screen.getByText('Safe content')).toBeDefined()
  })

  it('catches thrown error in child component and renders FullPageError', () => {
    // Suppress console.error from React's error logging during test
    const savedConsoleError = console.error
    console.error = () => {}

    try {
      render(
        <ErrorBoundary>
          <ThrowError message="Test error" />
        </ErrorBoundary>
      )

      // FullPageError renders the title "Something went wrong"
      expect(screen.getByText('Something went wrong')).toBeDefined()
      // The error message should also be rendered
      expect(screen.getByText('Test error')).toBeDefined()
    } finally {
      console.error = savedConsoleError
    }
  })

  it('renders custom fallback render prop with the error', () => {
    const savedConsoleError = console.error
    console.error = () => {}

    try {
      render(
        <ErrorBoundary
          fallback={error => (
            <div>Custom error: {(error as Error).message}</div>
          )}
        >
          <ThrowError message="Custom fallback error" />
        </ErrorBoundary>
      )

      expect(
        screen.getByText('Custom error: Custom fallback error')
      ).toBeDefined()
    } finally {
      console.error = savedConsoleError
    }
  })

  it('invokes onError callback with the error and error info', () => {
    const savedConsoleError = console.error
    console.error = () => {}

    try {
      let capturedError: Error | null = null
      let capturedInfo: React.ErrorInfo | null = null

      render(
        <ErrorBoundary
          onError={(error, info) => {
            capturedError = error
            capturedInfo = info
          }}
        >
          <ThrowError message="onError test" />
        </ErrorBoundary>
      )

      expect(capturedError).not.toBeNull()
      expect(capturedError!.message).toBe('onError test')
      expect(capturedInfo).not.toBeNull()
      expect(capturedInfo!.componentStack).toBeDefined()
    } finally {
      console.error = savedConsoleError
    }
  })

  it('supports nested safe content alongside error-prone siblings', () => {
    // Error boundaries only catch errors in their subtree during rendering.
    // Safe siblings should render normally even when an error boundary
    // is present and catching errors in another part of the tree.
    const savedConsoleError = console.error
    console.error = () => {}

    try {
      render(
        <div>
          <ErrorBoundary>
            <ThrowError message="Nested error" />
          </ErrorBoundary>
          <div data-testid="outside">Outside content</div>
        </div>
      )

      // The error boundary shows the fallback
      expect(screen.getByText('Something went wrong')).toBeDefined()

      // Content outside the error boundary remains unaffected
      expect(screen.getByTestId('outside').textContent).toBe('Outside content')
    } finally {
      console.error = savedConsoleError
    }
  })
})
