import { Block, Grid, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { Button, color } from '@repro/design'
import { JSONView } from '@repro/devtools'
import { SourceEventType } from '@repro/domain'
import {
  createSourcePlayback,
  EMPTY_PLAYBACK,
  PlaybackCanvas,
  PlaybackProvider,
} from '@repro/playback'
import { useRecordingStream } from '@repro/recording'
import { calculateDuration } from '@repro/source-utils'
import { approxByteLength } from '@repro/tdl'
import { CopyIcon } from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import React, { useEffect, useState } from 'react'
import { useSelectedEvent } from '~/hooks'

export const Details: React.FC = () => {
  const stream = useRecordingStream()
  const [playback, setPlayback] = useState(EMPTY_PLAYBACK)
  const [selectedEvent] = useSelectedEvent()

  useEffect(() => {
    if (selectedEvent) {
      const events = stream.slice()
      const duration = calculateDuration(events)
      const sourcePlayback = createSourcePlayback(events, duration, {})
      setPlayback(sourcePlayback)
    }
  }, [stream, selectedEvent, setPlayback])

  function copySnapshot() {
    navigator.clipboard.writeText(
      JSON.stringify(playback.getSnapshot(), null, 2)
    )
  }

  function copyEvent() {
    navigator.clipboard.writeText(JSON.stringify(selectedEvent, null, 2))
  }

  if (!selectedEvent) {
    return null
  }

  return (
    <Grid gridTemplateRows="auto auto 1fr" height="100%" overflow="hidden">
      <Row
        padding={10}
        alignItems="center"
        justifyContent="space-between"
        backgroundColor={color.bg.subtle}
        borderColor={color.border.strong}
        borderStyle="solid"
        borderWidth="0 0 1px"
      >
        <Block lineHeight={1.5}>
          <Block fontSize={16} fontWeight={700} color={color.primary}>
            {SourceEventType[selectedEvent.type]}
          </Block>

          <Block fontSize={12} color={color.text.muted}>
            {formatTime(selectedEvent.time, 'millis')} &middot;{' '}
            {prettyBytes(approxByteLength(selectedEvent))}
          </Block>
        </Block>

        <Row gap={10}>
          <Button
            context="neutral"
            size="small"
            rounded={false}
            onClick={copySnapshot}
          >
            <CopyIcon size={16} />
            <Block>Copy Snapshot</Block>
          </Button>

          <Button
            context="neutral"
            size="small"
            rounded={false}
            onClick={copyEvent}
          >
            <CopyIcon size={16} />
            <Block>Copy Event</Block>
          </Button>
        </Row>
      </Row>

      <Block padding={10} overflow="hidden">
        <Block
          height={480}
          borderColor={color.text.muted}
          borderStyle="solid"
          borderWidth={1}
        >
          <PlaybackProvider playback={playback} startTime={selectedEvent.time}>
            <PlaybackCanvas
              interactive={false}
              scaling="scale-to-fit"
              trackPointer={true}
              trackScroll={true}
            />
          </PlaybackProvider>
        </Block>
      </Block>

      <Block padding={10} overflow="scroll">
        <JSONView data={selectedEvent} />
      </Block>
    </Grid>
  )
}
