import { Block, Row } from '@jsxstyle/react'
import { Button, color } from '@repro/design'
import { DevTools } from '@repro/devtools'
import {
  PlaybackProvider,
  RangeTimeline,
  createSourcePlayback,
} from '@repro/playback'
import { randomString } from '@repro/random-string'
import { useRecordingStream } from '@repro/recording'
import { calculateDuration } from '@repro/source-utils'
import { DownloadIcon, HistoryIcon } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { exportReplayEvents } from './exportReplayEvents'

export const InstantReplayPane: React.FC = () => {
  const stream = useRecordingStream()
  const events = useMemo(() => stream.slice(), [stream])
  const duration = useMemo(() => calculateDuration(events), [events])
  const playback = useMemo(
    () => createSourcePlayback(events, duration, {}),
    [events]
  )

  const [min, setMin] = useState(0)
  const [max, setMax] = useState(playback.getDuration())

  useEffect(() => {
    setMax(playback.getDuration())
  }, [playback, setMax])

  const onUpdateRange = useCallback(
    (min: number, max: number) => {
      setMin(min)
      setMax(max)
    },
    [setMin, setMax]
  )

  const onSave = useCallback(() => {
    const minIndex = playback.getEventIndexAtTime(min)
    const maxIndex = playback.getEventIndexAtTime(max)

    // TODO: reconstruct leading snapshot event

    const eventData = new Blob([exportReplayEvents(events, minIndex, maxIndex)])

    const recordingId = randomString(8)

    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(eventData)
    anchor.download = `${recordingId}.repro`
    anchor.click()
  }, [events, min, max])

  return (
    <PlaybackProvider playback={playback}>
      <Block
        position="absolute"
        bottom={60}
        right={20}
        background={color.bg.hover}
        borderColor={color.text.secondary}
        borderStyle="solid"
        borderWidth="3px 1px 1px"
        pointerEvents="auto"
      >
        <Row
          alignItems="center"
          gap={5}
          padding={10}
          borderColor={color.border.strong}
          borderStyle="solid"
          borderWidth="0 0 1px"
          pointerEvents="auto"
        >
          <HistoryIcon size={24} color={color.text.secondary} />

          <Block color={color.text.secondary} fontSize={16}>
            Instant Replay
          </Block>

          <Block marginLeft="auto">
            <Button
              context="neutral"
              size="small"
              rounded={false}
              onClick={onSave}
            >
              <DownloadIcon size={16} />
              <Block>Save</Block>
            </Button>
          </Block>
        </Row>

        <Block
          width="calc(100vw - 40px)"
          height="calc(100vh - 140px)"
          borderRadius={4}
          overflow="hidden"
        >
          <DevTools timeline={<RangeTimeline onChange={onUpdateRange} />} />
        </Block>
      </Block>
    </PlaybackProvider>
  )
}
