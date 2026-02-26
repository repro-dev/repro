import React, { PropsWithChildren, useEffect, useState } from 'react'

interface DelayProps {
  duration?: number
}

/**
 * Defers rendering of children by a configurable duration.
 *
 * Use to prevent layout flashes for content that may resolve quickly
 * (e.g. loading spinners). Renders nothing until the timeout elapses,
 * then renders children. Defaults to a single-frame delay (~17ms).
 */
export const Delay: React.FC<PropsWithChildren<DelayProps>> = ({
  children,
  duration = 1000 / 60,
}) => {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => setReady(true), duration)
    return () => clearTimeout(timeout)
  }, [duration, setReady])

  if (!ready) {
    return null
  }

  return <>{children}</>
}
