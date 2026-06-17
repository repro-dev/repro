import { Block } from '@jsxstyle/react'
import { Button, FullPageError } from '@repro/design'
import React from 'react'

interface State {
  hasError: boolean
}

export class GlobalErrorBoundary extends React.Component<
  React.PropsWithChildren,
  State
> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('GlobalErrorBoundary caught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Block height="100vh">
          <FullPageError
            title="Something went wrong"
            description="An unexpected error occurred. Please reload the page to continue."
            action={
              <Button onClick={() => window.location.reload()}>
                Reload page
              </Button>
            }
          />
        </Block>
      )
    }
    return this.props.children
  }
}
