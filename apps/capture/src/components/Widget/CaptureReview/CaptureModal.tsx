import { Col, Row } from '@jsxstyle/react'
import { useSession } from '@repro/auth'
import {
  Button,
  FormField,
  Input,
  Label,
  Popover,
  Text,
  Tooltip,
  color,
  spacing,
} from '@repro/design'
import { usePlayback } from '@repro/playback'
import { CloudUploadIcon, DownloadIcon, LockIcon } from 'lucide-react'
import React, { useCallback, useState } from 'react'
import { useRecordingMode } from '~/state'
import { Modal } from '../Modal'
import { CaptureReview } from './CaptureReview'
import { useRecordingActions } from './useRecordingActions'

const DEFAULT_SELECTED_DURATION = 60_000

interface CaptureModalProps {
  open: boolean
  projectId: string | null
  onClose: () => void
}

export const CaptureModal: React.FC<CaptureModalProps> = ({
  open,
  projectId,
  onClose,
}) => {
  const playback = usePlayback()
  const session = useSession()
  const [recordingMode] = useRecordingMode()
  const [selectedDuration, setSelectedDuration] = useState(
    DEFAULT_SELECTED_DURATION
  )
  const [savePopoverOpen, setSavePopoverOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')

  const actions = useRecordingActions(
    playback,
    projectId,
    recordingMode,
    selectedDuration
  )

  const canSave = session !== null && projectId !== null

  const onDownloadLocally = useCallback(() => {
    actions.downloadLocally()
  }, [actions])

  const onSaveSubmit = useCallback(() => {
    actions.enqueueUpload({ title: saveTitle, description: null })
    setSavePopoverOpen(false)
  }, [actions, saveTitle])

  const headerActions = (
    <>
      <Row
        alignItems="center"
        paddingH={12}
        paddingV={8}
        backgroundColor="rgba(255, 255, 255, 0.1)"
        color={color.infoTint}
        hoverBackgroundColor={color.infoFg}
        borderRadius={2}
        transition="all 100ms ease-in-out"
        lineHeight={1}
        cursor="pointer"
        userSelect="none"
        props={{ onClick: onDownloadLocally }}
      >
        <Tooltip>Download locally</Tooltip>
        <DownloadIcon size={16} />
      </Row>

      <Popover
        open={savePopoverOpen}
        onOpenChange={open => {
          if (open && (!canSave || actions.uploadState.isUploading)) return
          setSavePopoverOpen(open)
        }}
      >
        <Popover.Trigger>
          <Row
            alignItems="center"
            gap={4}
            paddingH={12}
            paddingV={8}
            backgroundColor="rgba(255, 255, 255, 0.1)"
            color={color.infoTint}
            hoverBackgroundColor={
              canSave && !actions.uploadState.isUploading
                ? color.infoFg
                : undefined
            }
            borderRadius={2}
            transition="all 100ms ease-in-out"
            lineHeight={1}
            userSelect="none"
            cursor={
              canSave && !actions.uploadState.isUploading
                ? 'pointer'
                : 'not-allowed'
            }
            opacity={!canSave || actions.uploadState.isUploading ? 0.4 : 1}
          >
            <Tooltip>
              {canSave ? (
                'Save recording to project'
              ) : session === null ? (
                <>
                  <LockIcon size={16} /> Sign in to save
                </>
              ) : (
                'Select or create a project to upload. You can still download locally.'
              )}
            </Tooltip>
            <CloudUploadIcon size={16} />
            Save
          </Row>
        </Popover.Trigger>

        <Popover.Content
          aria-label="Save recording"
          side="bottom"
          align="end"
          style={{ outline: 'none' }}
        >
          <Col gap={spacing.md} minWidth={260}>
            <Text variant="heading3">Save recording</Text>
            <FormField>
              <Label>Title</Label>
              <Input
                value={saveTitle}
                onChange={e =>
                  setSaveTitle((e.target as HTMLInputElement).value)
                }
                size="small"
                placeholder="What did you record?"
                autoFocus={true}
              />
            </FormField>
            <Row justifyContent="flex-end">
              <Button
                variant="contained"
                size="small"
                disabled={
                  !canSave ||
                  actions.uploadState.isUploading ||
                  !saveTitle.trim()
                }
                onClick={onSaveSubmit}
              >
                Save
              </Button>
            </Row>
          </Col>
          <Popover.Arrow />
        </Popover.Content>
      </Popover>
    </>
  )

  return (
    <Modal
      title="Session Inspector"
      size="full-screen"
      open={open}
      onClose={onClose}
      headerActions={headerActions}
    >
      <CaptureReview
        projectId={projectId}
        onClose={onClose}
        actions={actions}
        playback={playback}
        recordingMode={recordingMode}
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
      />
    </Modal>
  )
}
