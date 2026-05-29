import React from 'react'
import { BranchActionBar } from './BranchActionBar'

// Re-export the AgenticAuthGate from its existing location
import { AgenticAuthGate } from '../ReportForm/Agentic/AgenticAuthGate'

interface AgenticSectionProps {
  onUploadToWorkspace: () => void
  onDownloadLocally: () => void
  onToggleManualUpload: () => void
  isManualUploadExpanded: boolean
  hasProjectId: boolean
}

export const AgenticSection: React.FC<AgenticSectionProps> = props => {
  return (
    <>
      <AgenticAuthGate />
      <BranchActionBar {...props} />
    </>
  )
}
