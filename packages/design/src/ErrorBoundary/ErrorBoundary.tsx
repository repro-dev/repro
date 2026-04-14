import React from 'react'
import { FullPageError } from '../FullPageError'

export interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: (error: unknown) => React.ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Error boundary that catches errors in its subtree and renders a fallback UI.
 *
 * By default renders `FullPageError` with the error message. Pass a `fallback`
 * render prop to customise the error UI. Pass `onError` to log errors to an
 * external service.
 *
 * Must be a class component — React error boundaries require the
 * `getDerivedStateFromError` / `componentDidCatch` class lifecycle methods.
 *
 * @example
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 *
 * @example
 *   <ErrorBoundary
 *     fallback={error => <Alert type="danger">{error.message}</Alert>}
 *     onError={(error, info) => logError(error, info)}
 *   >
 *     <MyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  static displayName = 'ErrorBoundary'

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error as Error }
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error as Error, errorInfo)
  }

  render() {
    const { error } = this.state
    const { children, fallback } = this.props

    if (error !== null) {
      if (fallback) {
        return fallback(error)
      }
      return (
        <FullPageError
          title="Something went wrong"
          description={error.message}
        />
      )
    }

    return children
  }
}
