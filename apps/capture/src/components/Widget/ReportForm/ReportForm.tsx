import { Block, Row } from '@jsxstyle/react'
import { IfGate, UnlessGate } from '@repro/auth'
import { formatTime } from '@repro/date-utils'
import { ToggleGroup } from '@repro/design'
import { DevTools } from '@repro/devtools'
import { RecordingMode } from '@repro/domain'
import { observeFuture } from '@repro/future-utils'
import { useMessaging } from '@repro/messaging'
import { PlaybackProvider, SimpleTimeline, usePlayback } from '@repro/playback'
import { fork, FutureInstance } from 'fluture'
import React, { useCallback, useEffect, useState } from 'react'
import { Subscription, switchMap, timer } from 'rxjs'
import { useRecordingMode } from '~/state'
import { Agentic } from './Agentic'
import { DetailsFields } from './DetailsFields'
import { AsideRegion, Layout, PlaybackRegion } from './Layout'
import { ProgressOverlay } from './ProgressOverlay'
import { FormValues } from './types'

const DEFAULT_SELECTED_DURATION = 60_000

export interface ReportFormProps {
  upload(values: FormValues): FutureInstance
  onSuccess(): void
  onError(error: Error): void
  onClose(): void
}

export const ReportForm: React.FC = ({
  upload,
  onSuccess,
  onError,
  onClose,
}) => {
  const agent = useMessaging()
  const playback = usePlayback()
  const [recordingMode] = useRecordingMode()
  const [uploadRef, setUploadRef] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [, setEnqueueError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [selectedDuration, setSelectedDuration] = useState(
    DEFAULT_SELECTED_DURATION
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

  useEffect(() => {
    playback.seekToTime(minTime)
  }, [playback, minTime])

  useEffect(() => {
    setSelectedDuration(Math.min(DEFAULT_SELECTED_DURATION, maxTime))
  }, [maxTime, setSelectedDuration])

  useEffect(() => {
    const subscription = new Subscription()

    if (uploadRef && uploading) {
      const progress$ = timer(0, 250).pipe(
        switchMap(() =>
          observeFuture(
            agent.raiseIntent({
              type: 'upload:progress',
              payload: {
                ref: uploadRef,
              },
            })
          )
        )
      )

      subscription.add(
        progress$.subscribe(progress => {
          setProgress(progress)

          if (progress.completed) {
            setUploading(false)
          }
        })
      )
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [setProgress, uploadRef, uploading, agent])

  const onSubmit = useCallback(
    (values: FormValues) => {
      setEnqueueError(null)

      fork(handleError)(handleEnqueued)(upload(values))

      function handleError(error: Error) {
        setUploading(false)
        setEnqueueError(error)
        onError(error)
      }

      function handleEnqueued(ref: string) {
        setUploading(true)
        setUploadRef(ref)
      }
    },
    [upload, setUploading, setUploadRef, onError, onSuccess, setEnqueueError]
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
          <UnlessGate gate="legacy-report-form">
            <Agentic />
          </UnlessGate>

          <IfGate gate="legacy-report-form">
            <DetailsFields
              onSubmit={({ title, description }) =>
                onSubmit({
                  title,
                  description,
                  duration: selectedDuration,
                })
              }
            />
          </IfGate>
        </AsideRegion>

        {progress && <ProgressOverlay progress={progress} onClose={onClose} />}
      </Layout>
    </PlaybackProvider>
  )
}
