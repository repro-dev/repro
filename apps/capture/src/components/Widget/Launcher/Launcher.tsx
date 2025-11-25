import { Block, Row } from '@jsxstyle/react'
import { animated, useTransition } from '@react-spring/web'
import { colors, Logo, Tooltip } from '@repro/design'
import { RecordingMode } from '@repro/domain'
import { XIcon } from 'lucide-react'
import React from 'react'
import { ReadyState, useReadyState, useRecordingMode } from '~/state'

export const Launcher: React.FC = () => {
  const [recordingMode, setRecordingMode] = useRecordingMode()
  const [, setReadyState] = useReadyState()

  const transitions = useTransition(recordingMode !== RecordingMode.None, {
    from: { opacity: 0, scale: 0.5, rotate: 45 },
    enter: { opacity: 1, scale: 1, rotate: 0 },
    leave: { opacity: 0, scale: 0.5, rotate: 45 },
  })

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
      justifyContent="center"
      gap={10}
      height={60}
      width={60}
      backgroundColor={colors.blue['800']}
      backgroundImage={`linear-gradient(to bottom right, ${colors.blue['900']}, ${colors.blue['700']})`}
      hoverBackgroundColor={colors.blue['800']}
      hoverBackgroundImage="none"
      borderRadius={8}
      border={`1px solid ${colors.blue['900']}`}
      boxShadow="0 0 16px rgba(0, 0, 0, 0.15)"
      scale={1}
      activeScale={0.9}
      translate="20px -20px"
      cursor="pointer"
      transition="all linear 100ms"
      onClick={onClick}
    >
      {recordingMode === RecordingMode.None && (
        <Tooltip position="right">Report a bug</Tooltip>
      )}

      <Block position="relative" width={28} height={28}>
        {transitions((style, active) => {
          if (active) {
            return (
              <animated.div style={{ ...style, position: 'absolute' }}>
                <XIcon size={28} color={colors.white} />
              </animated.div>
            )
          }

          return (
            <animated.div style={{ ...style, position: 'absolute' }}>
              <Logo size={28} iconOnly inverted />
            </animated.div>
          )
        })}
      </Block>
    </Row>
  )
}
