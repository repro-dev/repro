import React from 'react'
import { BranchActionBar } from './BranchActionBar'

// Re-export the AgenticAuthGate from its existing location
import { AgenticAuthGate } from '../ReportForm/Agentic/AgenticAuthGate'
import type { RecordingActions } from './useRecordingActions'

interface AgenticSectionProps {
  onUploadToWorkspace: () => void
  onDownloadLocally: () => void
  onToggleManualUpload: () => void
  isManualUploadExpanded: boolean
  hasProjectId: boolean
  getSelectedRecording: RecordingActions['getSelectedRecording']
}

export const AgenticSection: React.FC<AgenticSectionProps> = props => {
  return (
    <>
      <AgenticAuthGate
        getSelectedRecording={props.getSelectedRecording}
        hasProjectId={props.hasProjectId}
      />
      <BranchActionBar {...props} />
    </>
  )
}
