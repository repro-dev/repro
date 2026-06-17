import { Block, Row } from '@jsxstyle/react'
import { useAtomValue } from '@repro/atom'
import { Button, color, Logo, spacing, Toggle } from '@repro/design'
import { forget } from '@repro/future-utils'
import { useMessaging } from '@repro/messaging'
import { useRecordingStream } from '@repro/recording'
import {
  HistoryIcon,
  PictureInPictureIcon,
  TablePropertiesIcon,
} from 'lucide-react'
import React from 'react'
import { useVisiblePane } from '../hooks'
import { Pane } from '../types'

export const Toolbar: React.FC = () => {
  const stream = useRecordingStream()
  const [, setVisiblePane] = useVisiblePane()
  const isRecording = useAtomValue(stream.$started)
  const agent = useMessaging()

  function toggleRecording() {
    if (isRecording) {
      stream.stop()
      setVisiblePane(null)
    } else {
      stream.start()
    }

    forget(
      agent.raiseIntent({
        type: 'set-recording-state',
        payload: {
          recording: !isRecording,
        },
      })
    )
  }

  function openInstantReplay() {
    setVisiblePane(pane =>
      pane !== Pane.SaveRecording ? Pane.SaveRecording : null
    )
  }

  function openLivePlayback() {
    setVisiblePane(pane => (pane !== Pane.Playback ? Pane.Playback : null))
  }

  function openEventLog() {
    setVisiblePane(pane => (pane !== Pane.EventLog ? Pane.EventLog : null))
  }

  return (
    <Row
      position="absolute"
      right={20}
      bottom={0}
      paddingInline={spacing.lg}
      height={50}
      alignItems="center"
      backgroundColor={color.bg.hover}
      borderColor={color.text.secondary}
      borderStyle="solid"
      borderWidth="3px 1px 0"
      color={color.text.secondary}
      fontSize={16}
      pointerEvents="auto"
    >
      <Row alignItems="center" gap={spacing.lg}>
        <Logo size={24} />

        <Block
          alignSelf="stretch"
          width={1}
          backgroundColor={color.text.secondary}
        />

        <Toggle
          label="Recording"
          checked={isRecording}
          rounded={false}
          onChange={toggleRecording}
        />

        <Button
          context="neutral"
          size="small"
          rounded={false}
          onClick={openInstantReplay}
          disabled={!isRecording}
        >
          <HistoryIcon size={16} />
          <Block>Instant Replay</Block>
        </Button>

        <Button
          context="neutral"
          size="small"
          rounded={false}
          onClick={openLivePlayback}
          disabled={!isRecording}
        >
          <PictureInPictureIcon size={16} />
          <Block>Live Playback</Block>
        </Button>

        <Button
          context="neutral"
          size="small"
          rounded={false}
          onClick={openEventLog}
          disabled={!isRecording}
        >
          <TablePropertiesIcon size={16} />
          <Block>Event Log</Block>
        </Button>
      </Row>
    </Row>
  )
}
