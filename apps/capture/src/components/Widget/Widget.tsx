import { Block, InlineBlock } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { colors } from '@repro/design'
import { RecordingMode } from '@repro/domain'
import { useMessaging } from '@repro/messaging'
import { usePlayback } from '@repro/playback'
import { sliceEventsAtRange } from '@repro/recording'
import { toByteString } from '@repro/wire-formats'
import { detect } from 'detect-browser'
import React, { Fragment, useCallback } from 'react'
import { ReadyState, useReadyState, useRecordingMode } from '~/state'
import { Launcher } from './Launcher'
import { LiveControls } from './LiveControls'
import { ReportFormModal } from './ReportForm/ReportFormModal'
import { FormValues } from './ReportForm/types'

const browser = detect()

export const Widget: React.FC = () => {
  const playback = usePlayback()
  const [recordingMode, setRecordingMode] = useRecordingMode()
  const [readyState, setReadyState] = useReadyState()
  const agent = useMessaging()

  const isReady = readyState === ReadyState.Ready
  const isPendingLiveRecording =
    readyState === ReadyState.Pending && recordingMode === RecordingMode.Live

  const onReset = useCallback(() => {
    setReadyState(ReadyState.Idle)
    setRecordingMode(RecordingMode.None)
  }, [setReadyState, setRecordingMode])

  const onSuccess = useCallback(() => undefined, [])
  const onError = useCallback(() => undefined, [])

  const upload = useCallback(
    (values: FormValues) => {
      let events = playback.getSourceEvents()
      const maxTime = playback.getDuration()
      const minTime = Math.max(0, maxTime - (values.duration ?? 0))

      if (recordingMode === RecordingMode.Replay) {
        events = sliceEventsAtRange(events, [minTime, maxTime])
      }

      Analytics.track('capture:save-start', {
        recordingSize: events
          .toSource()
          .map(event => event.byteLength)
          .reduce((a, b) => a + b, 0)
          .toString(),
      })

      return agent.raiseIntent<string>({
        type: 'upload:enqueue',
        payload: {
          title: values.title,
          description: values.description,
          url: location.href,
          duration: values.duration,
          mode: recordingMode,
          events: events
            .toSource()
            .map(view =>
              toByteString(
                new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
              )
            ),
          browserName: browser && browser.name,
          browserVersion: browser && browser.version,
          operatingSystem: browser && browser.os,
        },
      })
    },
    [playback, recordingMode, agent]
  )

  return (
    <Fragment>
      <Block
        position="fixed"
        left={0}
        right={0}
        top={0}
        bottom={0}
        pointerEvents="none"
        borderColor={colors.blue['700']}
        borderStyle="solid"
        borderWidth={isPendingLiveRecording ? 5 : 0}
        transition="all linear 250ms"
      />

      <InlineBlock position="relative" pointerEvents="auto">
        <Launcher />
        {isPendingLiveRecording && <LiveControls />}

        <Block position="relative" translate="20px -90px">
          <ReportFormModal
            open={isReady}
            onClose={onReset}
            onSuccess={onSuccess}
            onError={onError}
            upload={upload}
          />
        </Block>
      </InlineBlock>
    </Fragment>
  )
}
