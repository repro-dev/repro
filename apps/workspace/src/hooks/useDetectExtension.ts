import { createMessagingAgent } from '@repro/messaging'
import { fork } from 'fluture'
import { useEffect, useMemo, useState } from 'react'

declare global {
  interface Window {
    __REPRO_HAS_CAPTURE_EXTENSION?: boolean
  }
}

export interface DetectExtensionResult {
  /** False until the messaging intent has resolved (success or failure). */
  loading: boolean
  /** True if the Repro capture extension responded to the detection intent. */
  hasExtension: boolean
}

export function useDetectExtension(): DetectExtensionResult {
  const agent = useMemo(
    () => createMessagingAgent({ name: 'extension-detector' }),
    []
  )
  const [hasExtension, setHasExtension] = useState(false)
  // Start in loading state to suppress the install prompt until detection settles.
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const onReject = (err: Error) => {
      console.error(err)
      setLoading(false)
    }
    const onResolve = (result: boolean) => {
      setHasExtension(result)
      setLoading(false)
    }
    const cancel = fork(onReject)(onResolve)(
      agent.raiseIntent({ type: 'detect-capture-extension' })
    )
    return cancel
  }, [agent])

  return { hasExtension, loading }
}
