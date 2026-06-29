import { Row } from '@jsxstyle/react'
import { useSession } from '@repro/auth'
import { Tooltip, color, lineHeight, spacing } from '@repro/design'
import { usePlayback } from '@repro/playback'
import { DownloadIcon } from 'lucide-react'
import React, { useCallback, useState } from 'react'
import { useRecordingMode } from '~/state'
import { Modal } from '../Modal'
import { CaptureReview } from './CaptureReview'
import { CaptureUploadProvider } from './CaptureUploadProvider'
import { SaveRecordingPopover } from './SaveRecordingPopover'
import { useRecordingActions } from './useRecordingActions'
const DEFAULT_SELECTED_DURATION = 60_000

interface CaptureModalProps {
  open: boolean
  onClose: () => void
}

export const CaptureModal: React.FC<CaptureModalProps> = ({
  open,
  onClose,
}) => {
  const playback = usePlayback()
  const session = useSession()

  const [recordingMode] = useRecordingMode()
  const [selectedDuration, setSelectedDuration] = useState(
    DEFAULT_SELECTED_DURATION
  )

  const actions = useRecordingActions(playback, recordingMode, selectedDuration)

  const isAuthed = session !== null

  const onDownloadLocally = useCallback(() => {
    actions.downloadLocally()
  }, [actions])

  const headerActions = (
    <>
      <Row
        alignItems="center"
        paddingH={spacing.lg}
        paddingV={spacing.md}
        // eslint-disable-next-line @repro/oxlint-plugin-design/no-hardcoded-color -- transparent white glass tint over header, no exact token equivalent
        backgroundColor="rgba(255, 255, 255, 0.1)"
        color={color.infoTint}
        hoverBackgroundColor={actions.isEmpty ? undefined : color.infoFg}
        borderRadius={2}
        transition="all 100ms ease-in-out"
        lineHeight={lineHeight.tight}
        cursor={actions.isEmpty ? 'not-allowed' : 'pointer'}
        opacity={actions.isEmpty ? 0.4 : 1}
        userSelect="none"
        props={{
          onClick: actions.isEmpty ? undefined : onDownloadLocally,
          role: 'button',
          tabIndex: actions.isEmpty ? undefined : 0,
          'aria-label': 'Download .repro file',
          'aria-disabled': actions.isEmpty ? true : undefined,
          onKeyDown: actions.isEmpty
            ? undefined
            : (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onDownloadLocally()
                }
              },
        }}
      >
        <Tooltip>Download locally</Tooltip>
        <DownloadIcon size={16} />
      </Row>

      <SaveRecordingPopover isAuthed={isAuthed} />
    </>
  )

  return (
    <CaptureUploadProvider
      open={open}
      playback={playback}
      recordingMode={recordingMode}
      selectedDuration={selectedDuration}
    >
      <Modal
        title="Session Inspector"
        size="full-screen"
        open={open}
        onClose={onClose}
        headerActions={headerActions}
      >
        <CaptureReview
          onClose={onClose}
          actions={actions}
          playback={playback}
          recordingMode={recordingMode}
          selectedDuration={selectedDuration}
          setSelectedDuration={setSelectedDuration}
        />
      </Modal>
    </CaptureUploadProvider>
  )
}
