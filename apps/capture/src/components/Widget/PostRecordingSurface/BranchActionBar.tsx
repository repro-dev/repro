import { Col } from '@jsxstyle/react'
import { useSession } from '@repro/auth'
import { Button, spacing } from '@repro/design'
import {
  BugPlayIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
} from 'lucide-react'
import React from 'react'

interface BranchActionBarProps {
  onUploadToWorkspace: () => void
  onDownloadLocally: () => void
  onToggleManualUpload: () => void
  isManualUploadExpanded: boolean
  hasProjectId: boolean
}

export const BranchActionBar: React.FC<BranchActionBarProps> = ({
  onUploadToWorkspace,
  onDownloadLocally,
  onToggleManualUpload,
  isManualUploadExpanded,
  hasProjectId,
}) => {
  const session = useSession()
  const isAuthed = session !== null

  return (
    <Col gap={spacing.sm} padding={spacing.md}>
      {isAuthed && hasProjectId ? (
        <Button variant="contained" size="small" onClick={onUploadToWorkspace}>
          <BugPlayIcon size={16} />
          Upload to Workspace
        </Button>
      ) : (
        <Button
          variant="outlined"
          size="small"
          disabled={true}
          props={{ title: 'Sign in to upload' }}
        >
          <BugPlayIcon size={16} />
          Upload to Workspace
        </Button>
      )}

      <Button variant="outlined" size="small" onClick={onDownloadLocally}>
        <DownloadIcon size={16} />
        Download Locally
      </Button>

      <Button variant="text" size="small" onClick={onToggleManualUpload}>
        {isManualUploadExpanded ? (
          <ChevronUpIcon size={16} />
        ) : (
          <ChevronDownIcon size={16} />
        )}
        Manual Upload
      </Button>
    </Col>
  )
}
