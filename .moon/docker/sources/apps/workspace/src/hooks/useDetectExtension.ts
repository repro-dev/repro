import { createPTPAgent } from '@repro/messaging'
import { fork } from 'fluture'
import { useEffect, useMemo, useState } from 'react'

declare global {
  interface Window {
    __REPRO_HAS_CAPTURE_EXTENSION?: boolean
  }
}

export function useDetectExtension() {
  const agent = useMemo(createPTPAgent, [])
  const [hasExtension, setHasExtension] = useState(false)

  useEffect(() => {
    return agent
      .raiseIntent<boolean>({ type: 'detect-capture-extension' })
      .pipe(fork(console.error)(setHasExtension))
  }, [agent])

  return hasExtension
}
