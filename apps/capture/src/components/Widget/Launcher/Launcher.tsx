import { Row } from '@jsxstyle/react'
import { Button, colors, Logo } from '@repro/design'
import { RecordingMode } from '@repro/domain'
import { HistoryIcon, VideoIcon, XIcon } from 'lucide-react'
import React, { Fragment } from 'react'
import { ReadyState, useReadyState, useRecordingMode } from '~/state'

export const Launcher: React.FC = () => {
  const [recordingMode, setRecordingMode] = useRecordingMode()
  const [, setReadyState] = useReadyState()

  function onUseLive() {
    setReadyState(ReadyState.Pending)
    setRecordingMode(RecordingMode.Live)
  }

  function onUseReplay() {
    setReadyState(ReadyState.Ready)
    setRecordingMode(RecordingMode.Replay)
  }

  function onReset() {
    setReadyState(ReadyState.Idle)
    setRecordingMode(RecordingMode.None)
  }

  return (
    <Row
      alignItems="center"
      gap={10}
      height={60}
      paddingInline={10}
      backgroundColor={colors.white}
      borderRadius={2}
      border={`1px solid ${colors.blue['900']}`}
      boxShadow="0 0 16px rgba(0, 0, 0, 0.15)"
      transform="translate(20px, -20px)"
    >
      <Logo size={24} />

      {recordingMode === RecordingMode.None && (
        <Fragment>
          <Button onClick={onUseLive}>
            <VideoIcon size={20} />
            Record
          </Button>

          <Button onClick={onUseReplay}>
            <HistoryIcon size={20} />
            Replay
          </Button>
        </Fragment>
      )}

      {recordingMode !== RecordingMode.None && (
        <Button variant="outlined" onClick={onReset}>
          <XIcon size={20} />
        </Button>
      )}
    </Row>
  )
}
