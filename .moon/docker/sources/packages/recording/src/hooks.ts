import { useContext } from 'react'
import { RecordingStreamContext } from './context'

export function useRecordingStream() {
  return useContext(RecordingStreamContext)
}
