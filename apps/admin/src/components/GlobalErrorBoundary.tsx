import { Button, FullPageError } from '@repro/design'
import React from 'react'

interface State {
  hasError: boolean
  error: Error | null
}

export class GlobalErrorBoundary extends React.Component<
  React.PropsWithChildren,
  State
> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('GlobalErrorBoundary caught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <FullPageError
          title="Something went wrong"
          description="An unexpected error occurred. Please reload the page to continue."
          action={
            <Button onClick={() => window.location.reload()}>
              Reload page
            </Button>
          }
        />
      )
    }
    return this.props.children
  }
}
