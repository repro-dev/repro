import { Block, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { colors, ToggleGroup } from '@repro/design'
import { RecordingMode } from '@repro/domain'
import { observeFuture } from '@repro/future-utils'
import { useMessaging } from '@repro/messaging'
import {
  PlaybackCanvas,
  PlaybackProvider,
  SimpleTimeline,
  usePlayback,
} from '@repro/playback'
import { UploadProgress } from '@repro/recording-api'
import { fork, FutureInstance } from 'fluture'
import React, { useCallback, useEffect, useState } from 'react'
import { Subscription, switchMap, timer } from 'rxjs'
import { useRecordingMode } from '~/state'
import { DetailsFields } from './DetailsFields'
import { DetailsRegion, Layout, PlaybackRegion } from './Layout'
import { ProgressOverlay } from './ProgressOverlay'
import { FormValues } from './types'

const DEFAULT_SELECTED_DURATION = 60_000

export interface ReportFormProps {
  upload(values: FormValues): FutureInstance<Error, string>
  onSuccess(): void
  onError(error: Error): void
  onClose(): void
}

export const ReportForm: React.FC<ReportFormProps> = ({
  upload,
  onSuccess,
  onError,
  onClose,
}) => {
  const agent = useMessaging()
  const playback = usePlayback()
  const [recordingMode] = useRecordingMode()
  const [uploadRef, setUploadRef] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [, setEnqueueError] = useState<Error | null>(null)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
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
          observeFuture<Error, UploadProgress>(
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
              gap={10}
              alignItems="center"
              justifyContent="flex-end"
              padding={10}
              zIndex={1}
              boxShadow={`
                  0 4px 16px rgba(0, 0, 0, 0.1),
                  0 1px 2px rgba(0, 0, 0, 0.1)
                `}
            >
              <Block fontSize={13} fontWeight={700} color={colors.slate['700']}>
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

          <PlaybackCanvas
            interactive={false}
            trackPointer={recordingMode !== RecordingMode.Snapshot}
            trackScroll={true}
            scaling="scale-to-fit"
          />

          {(recordingMode === RecordingMode.Live ||
            recordingMode === RecordingMode.Replay) && (
            <Block
              zIndex={1}
              padding={10}
              boxShadow={`
                  0 -4px 16px rgba(0, 0, 0, 0.1),
                  0 -1px 2px rgba(0, 0, 0, 0.1)
                `}
            >
              <SimpleTimeline min={minTime} max={maxTime} />
            </Block>
          )}
        </PlaybackRegion>

        <DetailsRegion>
          <DetailsFields
            onSubmit={({ title, description }) =>
              onSubmit({
                title,
                description,
                duration: selectedDuration,
              })
            }
          />
        </DetailsRegion>

        {progress && <ProgressOverlay progress={progress} onClose={onClose} />}
      </Layout>
    </PlaybackProvider>
  )
}
