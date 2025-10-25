import React, { PropsWithChildren } from 'react'
import {
  EMPTY_RECORDING_STREAM,
  RecordingStream,
} from './createRecordingStream'

export const RecordingStreamContext = React.createContext<RecordingStream>(
  EMPTY_RECORDING_STREAM
)

export const RecordingStreamProvider: React.FC<
  PropsWithChildren<{ stream: RecordingStream }>
> = ({ children, stream }) => (
  <RecordingStreamContext.Provider value={stream}>
    {children}
  </RecordingStreamContext.Provider>
)
