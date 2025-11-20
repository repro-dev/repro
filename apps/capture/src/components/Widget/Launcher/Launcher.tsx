import { Block, Row } from '@jsxstyle/react'
import { colors, Logo, Tooltip } from '@repro/design'
import { RecordingMode } from '@repro/domain'
import { XIcon } from 'lucide-react'
import React from 'react'
import { ReadyState, useReadyState, useRecordingMode } from '~/state'

export const Launcher: React.FC = () => {
  const [recordingMode, setRecordingMode] = useRecordingMode()
  const [, setReadyState] = useReadyState()

  // function onUseLive() {
  //   setReadyState(ReadyState.Pending)
  //   setRecordingMode(RecordingMode.Live)
  // }

  function onUseReplay() {
    setReadyState(ReadyState.Ready)
    setRecordingMode(RecordingMode.Replay)
  }

  function onReset() {
    setReadyState(ReadyState.Idle)
    setRecordingMode(RecordingMode.None)
  }

  function onClick() {
    if (recordingMode === RecordingMode.None) {
      onUseReplay()
    } else {
      onReset()
    }
  }

  return (
    <Row
      alignItems="center"
      gap={10}
      height={60}
      paddingInline={15}
      backgroundColor={colors.blue['800']}
      backgroundImage={`linear-gradient(to bottom right, ${colors.blue['900']}, ${colors.blue['700']})`}
      hoverBackgroundColor={colors.blue['800']}
      hoverBackgroundImage="none"
      borderRadius={8}
      border={`1px solid ${colors.blue['900']}`}
      boxShadow="0 0 16px rgba(0, 0, 0, 0.15)"
      transform="translate(20px, -20px)"
      cursor="pointer"
      transition="all linear 100ms"
      onClick={onClick}
    >
      {recordingMode === RecordingMode.None && (
        <Tooltip position="right">Report a bug</Tooltip>
      )}

      <Block>
        {recordingMode === RecordingMode.None ? (
          <Logo size={28} iconOnly inverted />
        ) : (
          <XIcon size={28} color={colors.white} />
        )}
      </Block>
    </Row>
  )
}
