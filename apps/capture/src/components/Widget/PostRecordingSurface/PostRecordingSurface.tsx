import { Block, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { color, shadow, ToggleGroup } from '@repro/design'
import { DevTools } from '@repro/devtools'
import { RecordingMode } from '@repro/domain'
import { PlaybackProvider, SimpleTimeline, usePlayback } from '@repro/playback'
import React, { useCallback, useState } from 'react'
import { useRecordingMode } from '~/state'
import { AsideRegion, Layout, PlaybackRegion } from '../ReportForm/Layout'
import { ProgressOverlay } from '../ReportForm/ProgressOverlay'
import { AgenticSection } from './AgenticSection'
import { ManualUploadForm } from './ManualUploadForm'
import { useRecordingActions } from './useRecordingActions'

const DEFAULT_SELECTED_DURATION = 60_000

interface PostRecordingSurfaceProps {
  projectId: string | null
  onClose: () => void
}

export const PostRecordingSurface: React.FC<PostRecordingSurfaceProps> = ({
  projectId,
  onClose,
}) => {
  const playback = usePlayback()
  const [recordingMode] = useRecordingMode()
  const [selectedDuration, setSelectedDuration] = useState(
    DEFAULT_SELECTED_DURATION
  )
  const [manualUploadExpanded, setManualUploadExpanded] = useState(false)

  const actions = useRecordingActions(
    playback,
    projectId,
    recordingMode,
    selectedDuration
  )

  const maxTime = playback.getDuration()
  const minTime = Math.max(0, maxTime - selectedDuration)

  const durationOptions = [
    { value: maxTime, label: `Max (${formatTime(maxTime, 'seconds')})` },
    { value: 120_000, label: 'Last 2m' },
    { value: 60_000, label: 'Last 1m' },
    { value: 30_000, label: 'Last 30s' },
    { value: 10_000, label: 'Last 10s' },
  ].filter(option => option.value <= maxTime)

  // Seek playback to the selected range
  React.useEffect(() => {
    playback.seekToTime(minTime)
  }, [playback, minTime])

  React.useEffect(() => {
    setSelectedDuration(Math.min(DEFAULT_SELECTED_DURATION, maxTime))
  }, [maxTime, setSelectedDuration])

  const onUploadToWorkspace = useCallback(() => {
    actions.enqueueUpload({ title: 'Bug Report', description: null })
  }, [actions])

  const onDownloadLocally = useCallback(() => {
    actions.downloadLocally()
  }, [actions])

  const onToggleManualUpload = useCallback(() => {
    setManualUploadExpanded(prev => !prev)
  }, [setManualUploadExpanded])

  const onManualUploadSubmit = useCallback(
    (values: { title: string; description: string }) => {
      actions.enqueueUpload({
        title: values.title,
        description: values.description || null,
      })
    },
    [actions]
  )

  return (
    <PlaybackProvider playback={playback}>
      <Layout>
        <PlaybackRegion>
          {recordingMode === RecordingMode.Replay &&
          durationOptions.length > 1 ? (
            <Row
              gap={8}
              alignItems="center"
              justifyContent="flex-end"
              padding={8}
              zIndex={1}
              boxShadow={shadow.md}
            >
              <Block
                fontSize={11}
                fontWeight={700}
                color={color.text.secondary}
              >
                Duration
              </Block>

              <ToggleGroup
                options={durationOptions}
                selected={selectedDuration}
                onChange={setSelectedDuration}
              />
            </Row>
          ) : (
            <Block />
          )}

          <DevTools
            hideInspectorOnOpen
            timeline={<SimpleTimeline min={minTime} max={maxTime} />}
          />
        </PlaybackRegion>

        <AsideRegion>
          <AgenticSection
            onUploadToWorkspace={onUploadToWorkspace}
            onDownloadLocally={onDownloadLocally}
            onToggleManualUpload={onToggleManualUpload}
            isManualUploadExpanded={manualUploadExpanded}
            hasProjectId={projectId !== null}
          />

          {manualUploadExpanded && (
            <ManualUploadForm
              onSubmit={onManualUploadSubmit}
              isUploading={actions.uploadState.isUploading}
            />
          )}
        </AsideRegion>

        {actions.uploadState.progress && (
          <ProgressOverlay
            progress={actions.uploadState.progress}
            onClose={onClose}
          />
        )}
      </Layout>
    </PlaybackProvider>
  )
}
