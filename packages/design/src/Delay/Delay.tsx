import React, { PropsWithChildren, useEffect, useState } from 'react'

interface DelayProps {
  duration?: number
}

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
