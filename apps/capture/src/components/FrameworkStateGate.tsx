import { useHasGate } from '@repro/auth'
import { useRecordingStream } from '@repro/recording'
import { useEffect } from 'react'

export function FrameworkStateGate() {
  const stream = useRecordingStream()
  const hasGate = useHasGate('framework-state')

  useEffect(() => {
    if (hasGate) {
      stream.enableFrameworkStateRecording()
    }
  }, [stream, hasGate])

  return null
}
