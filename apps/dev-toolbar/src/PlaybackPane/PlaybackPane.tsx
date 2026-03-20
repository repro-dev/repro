import { Block, Row } from '@jsxstyle/react'
import { Button, colors } from '@repro/design'
import {
  PlaybackCanvas,
  PlaybackProvider,
  createLivePlayback,
} from '@repro/playback'
import { InterruptSignal, useRecordingStream } from '@repro/recording'
import { CopyIcon, PictureInPictureIcon } from 'lucide-react'
import React, { useMemo } from 'react'

export const PlaybackPane: React.FC = () => {
  const recordingStream = useRecordingStream()

  const playback = useMemo(
    () => createLivePlayback(recordingStream.tail(InterruptSignal)),
    [recordingStream]
  )

  function copySnapshot() {
    navigator.clipboard.writeText(
      JSON.stringify(playback.getSnapshot(), undefined, 2)
    )
  }

  return (
    <PlaybackProvider playback={playback}>
      <Block
        position="absolute"
        bottom={60}
        right={20}
        background={colors.slate['100']}
        borderColor={colors.slate['700']}
        borderStyle="solid"
        borderWidth="3px 1px 1px"
      >
        <Row
          alignItems="center"
          gap={5}
          padding={10}
          borderColor={colors.slate['300']}
          borderStyle="solid"
          borderWidth="0 0 1px"
          pointerEvents="auto"
        >
          <PictureInPictureIcon size={24} color={colors.slate['700']} />

          <Block color={colors.slate['700']} fontSize={16}>
            Live Playback
          </Block>

          <Block marginLeft="auto">
            <Button
              context="neutral"
              size="small"
              rounded={false}
              onClick={copySnapshot}
            >
              <CopyIcon size={16} />
              <Block>Copy Snapshot</Block>
            </Button>
          </Block>
        </Row>

        <Block width={640} height={360} borderRadius={4} overflow="hidden">
          <PlaybackCanvas
            interactive={false}
            trackPointer={true}
            trackScroll={true}
            scaling="scale-to-fit"
          />
        </Block>
      </Block>
    </PlaybackProvider>
  )
}
