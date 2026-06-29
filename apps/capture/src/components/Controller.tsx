import { Block } from '@jsxstyle/react'
import { useSession } from '@repro/auth'
import { RecordingMode, SourceEventType, SourceEventView } from '@repro/domain'
import {
  Playback,
  PlaybackProvider,
  createSourcePlayback,
} from '@repro/playback'
import {
  InterruptSignal,
  setRedactionConfig,
  useRecordingStream,
} from '@repro/recording'
import { calculateDuration } from '@repro/source-utils'
import { Box, List } from '@repro/tdl'
import React, { useEffect, useState } from 'react'
import {
  Subscription,
  asyncScheduler,
  defer,
  map,
  observeOn,
  of,
  toArray,
} from 'rxjs'
import { PrivacyIndicator } from '~/components/PrivacyIndicator'
import { MAX_INT32 } from '~/constants'
import { useRecordingMode } from '~/state'
import { useRecordingPrivacyPreset } from '~/useRecordingPrivacyPreset'
import { Widget } from './Widget'

export const Controller: React.FC = () => {
  const stream = useRecordingStream()
  const session = useSession()
  const { override, loading: presetLoading } = useRecordingPrivacyPreset()

  const [playback, setPlayback] = useState<Playback | null>(null)
  const [recordingMode] = useRecordingMode()

  useEffect(() => {
    // Gate start() on preset resolution. Until the preset resolves (or falls
    // back to standard on error), do not start the stream so masking/redaction
    // config is in effect for captured events.
    if (presetLoading) {
      return
    }

    // Apply the preset-derived config before start() so all observers see it.
    // maskedSelectors is applied via updateMaskedSelectors (mutates the
    // options reference shared by tree walker, DOM visitor, and DOM observer).
    stream.updateMaskedSelectors(override.maskedSelectors)

    // Apply redaction config overrides (undefined → full DEFAULT_REDACTION_CONFIG)
    if (override.redaction) {
      setRedactionConfig(override.redaction)
    }

    stream.start()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stream.stop()
      } else {
        if (!stream.isStarted()) {
          stream.start()
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stream.stop()
    }
  }, [stream, override, presetLoading])

  useEffect(() => {
    const subscription = new Subscription()

    switch (recordingMode) {
      case RecordingMode.Snapshot:
        of(stream.snapshot())
          .pipe(
            map(snapshot =>
              SourceEventView.encode(
                new Box({
                  type: SourceEventType.Snapshot,
                  time: 0,
                  data: snapshot,
                })
              )
            ),
            observeOn(asyncScheduler)
          )
          .subscribe(event => {
            setPlayback(
              createSourcePlayback(new List(SourceEventView, [event]), 0, {})
            )
          })
        break

      case RecordingMode.Replay:
        subscription.add(
          defer(() => of(stream.slice()))
            .pipe(observeOn(asyncScheduler))
            .subscribe(events => {
              setPlayback(
                createSourcePlayback(events, calculateDuration(events), {})
              )
            })
        )
        break

      case RecordingMode.Live:
        subscription.add(
          stream
            .tail(InterruptSignal)
            .pipe(
              toArray(),
              map(events => new List(SourceEventView, events))
            )
            .subscribe(events => {
              setPlayback(
                createSourcePlayback(events, calculateDuration(events), {})
              )
            })
        )
        break

      case RecordingMode.None:
        setPlayback(null)
        break
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [recordingMode, setPlayback])

  return (
    <PlaybackProvider playback={playback}>
      <Block
        position="fixed"
        bottom={0}
        left={0}
        right={0}
        zIndex={MAX_INT32}
        pointerEvents="none"
      >
        <Widget />
      </Block>
      {session && !presetLoading && <PrivacyIndicator override={override} />}
    </PlaybackProvider>
  )
}
