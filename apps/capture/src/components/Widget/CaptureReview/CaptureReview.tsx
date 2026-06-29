import { Block, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import {
  Alert,
  ToggleGroup,
  color,
  fontSize,
  fontWeight,
  shadow,
  spacing,
} from '@repro/design'
import { DevTools, useDevToolsView } from '@repro/devtools'
import { useInspecting } from '@repro/devtools/src/hooks'
import { View } from '@repro/devtools/src/types'
import { RecordingMode } from '@repro/domain'
import { Playback, PlaybackProvider, SimpleTimeline } from '@repro/playback'
import { findErrorAndWarningEvents } from '@repro/source-utils'
import React, { useEffect, useMemo } from 'react'
import { useRecordingPrivacyPreset } from '~/useRecordingPrivacyPreset'
import { AsideRegion, Layout, PlaybackRegion } from '../ReportForm/Layout'
import { ProgressOverlay } from '../ReportForm/ProgressOverlay'
import { AgenticSection } from './AgenticSection'
import { useCaptureUpload } from './CaptureUploadProvider'
import { type PrivacyOverrides } from './PrivacySection'
import { RecordingActions } from './useRecordingActions'

const DEFAULT_SELECTED_DURATION = 60_000

interface CaptureReviewProps {
  onClose: () => void
  actions: RecordingActions
  playback: Playback
  recordingMode: RecordingMode
  selectedDuration: number
  setSelectedDuration: (duration: number) => void
  privacyOverrides: PrivacyOverrides
}

function getNoticeForOverride(
  maskedSelectors: Array<string>,
  maskImages: boolean
): { label: string; summary: string } {
  if (maskImages) {
    return {
      label: 'Strict',
      summary:
        'Inputs, images, and .repro-mask elements are masked. PII and auth headers are redacted.',
    }
  }
  if (maskedSelectors.length === 0) {
    return {
      label: 'Off',
      summary:
        'Minimal filtering — only authentication headers are redacted. All other content is recorded as-is.',
    }
  }
  return {
    label: 'Standard',
    summary:
      'Only .repro-mask elements are masked. PII and auth headers are redacted.',
  }
}

export const CaptureReview: React.FC<CaptureReviewProps> = ({
  onClose,
  actions,
  playback,
  recordingMode,
  selectedDuration,
  setSelectedDuration,
  privacyOverrides,
}) => {
  const maxTime = playback.getDuration()
  const minTime = Math.max(0, maxTime - selectedDuration)

  const { override, loading: presetLoading } = useRecordingPrivacyPreset()

  const durationOptions = [
    { value: maxTime, label: `Max (${formatTime(maxTime, 'seconds')})` },
    { value: 120_000, label: 'Last 2m' },
    { value: 60_000, label: 'Last 1m' },
    { value: 30_000, label: 'Last 30s' },
    { value: 10_000, label: 'Last 10s' },
  ].filter(option => option.value <= maxTime)

  React.useEffect(() => {
    playback.seekToTime(minTime)
  }, [playback, minTime])

  React.useEffect(() => {
    setSelectedDuration(Math.min(DEFAULT_SELECTED_DURATION, maxTime))
  }, [maxTime, setSelectedDuration])

  const { uploadState, setPrivacyOverrides: setUploadPrivacyOverrides } =
    useCaptureUpload()

  // Sync privacy overrides into the upload provider so its enqueueUpload
  // includes them in the upload payload. Actual event transforms happen
  // at save/download time (tracked in a follow-up issue).
  useEffect(() => {
    setUploadPrivacyOverrides(privacyOverrides)
  }, [privacyOverrides, setUploadPrivacyOverrides])

  const [, setView] = useDevToolsView()
  const [, setInspecting] = useInspecting()

  const errorAndWarningEvents = useMemo(
    () => findErrorAndWarningEvents(playback.getSourceEvents()),
    [playback]
  )

  const handleMarkerClick = (_: unknown) => {
    setView(View.Console)
    setInspecting(true)
  }

  return (
    <PlaybackProvider playback={playback}>
      <Layout>
        <PlaybackRegion>
          {recordingMode === RecordingMode.Replay &&
          durationOptions.length > 1 ? (
            <Row
              gap={spacing.md}
              alignItems="center"
              justifyContent="flex-end"
              padding={spacing.md}
              zIndex={1}
              boxShadow={shadow.md}
            >
              <Block
                fontSize={fontSize.xs}
                fontWeight={fontWeight.bold}
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
            timeline={
              <SimpleTimeline
                min={minTime}
                max={maxTime}
                errorAndWarningEvents={errorAndWarningEvents}
                onMarkerClick={handleMarkerClick}
              />
            }
          />
        </PlaybackRegion>

        <AsideRegion>
          {!presetLoading && (
            <Alert type="info">
              This recording was captured with the{' '}
              <strong>
                {
                  getNoticeForOverride(
                    override.maskedSelectors,
                    override.maskImages
                  ).label
                }
              </strong>{' '}
              privacy preset.{' '}
              {
                getNoticeForOverride(
                  override.maskedSelectors,
                  override.maskImages
                ).summary
              }
            </Alert>
          )}

          <AgenticSection getSelectedRecording={actions.getSelectedRecording} />
        </AsideRegion>

        {uploadState.progress && (
          <ProgressOverlay
            progress={uploadState.progress}
            projectId={uploadState.uploadProjectId}
            onClose={onClose}
          />
        )}
      </Layout>
    </PlaybackProvider>
  )
}
