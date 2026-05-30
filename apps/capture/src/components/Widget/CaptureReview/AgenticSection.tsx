import React from 'react'
import { AgenticAuthGate } from '../ReportForm/Agentic/AgenticAuthGate'
import type { RecordingActions } from './useRecordingActions'

interface AgenticSectionProps {
  getSelectedRecording: RecordingActions['getSelectedRecording']
}

export const AgenticSection: React.FC<AgenticSectionProps> = props => {
  return <AgenticAuthGate getSelectedRecording={props.getSelectedRecording} />
}
