import { Trace } from '@repro/diagnostics'
import { logger } from '@repro/logger'
import React, { PropsWithChildren } from 'react'

export class PlaybackErrorBoundary extends React.Component<PropsWithChildren> {
  state = {
    hasError: false,
    error: null,
  }

  static getDerivedStateFromError(err: any) {
    return {
      hasError: true,
      error: err,
    }
  }

  componentDidCatch() {
    // TODO: render last good snapshot and highlight failing patch
    logger.log(Trace.getLastFrame())
  }

  render() {
    if (this.state.hasError) {
      return 'Error!'
    }

    return this.props.children
  }
}

export function withPlaybackErrorBoundary<P>(
  Component: React.ComponentType<P>
) {
  const Wrapped: React.FC<P> = props => (
    <PlaybackErrorBoundary>
      <Component key="0" {...props} />
    </PlaybackErrorBoundary>
  )

  Wrapped.displayName = `WithPlaybackErrorBoundary(${
    Component.displayName ?? 'Unknown'
  })`

  return Wrapped
}
