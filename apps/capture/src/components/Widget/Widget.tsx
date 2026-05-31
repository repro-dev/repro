import { Block, InlineBlock } from '@jsxstyle/react'
import { color, transition } from '@repro/design'
import { RecordingMode } from '@repro/domain'
import React, { useCallback } from 'react'
import { ReadyState, useReadyState, useRecordingMode } from '~/state'
import { CaptureModal } from './CaptureReview/CaptureModal'
import { Launcher } from './Launcher'
import { LiveControls } from './LiveControls'

export const Widget: React.FC = () => {
  const [recordingMode, setRecordingMode] = useRecordingMode()
  const [readyState, setReadyState] = useReadyState()

  const isReady = readyState === ReadyState.Ready
  const isPendingLiveRecording =
    readyState === ReadyState.Pending && recordingMode === RecordingMode.Live

  const onReset = useCallback(() => {
    setReadyState(ReadyState.Idle)
    setRecordingMode(RecordingMode.None)
  }, [setReadyState, setRecordingMode])

  return (
    <React.Fragment>
      <Block
        position="fixed"
        left={0}
        right={0}
        top={0}
        bottom={0}
        pointerEvents="none"
        borderColor={color.primary}
        borderStyle="solid"
        borderWidth={isPendingLiveRecording ? 5 : 0}
        transition={transition.default}
      />

      {isReady && (
        <Block
          position="fixed"
          top={0}
          right={0}
          bottom={0}
          left={0}
          backgroundColor={color.bg.overlay}
          backdropFilter="blur(5px)"
          props={{ onClick: onReset }}
        />
      )}

      <InlineBlock position="relative" pointerEvents="auto">
        <Launcher />
        {isPendingLiveRecording && <LiveControls />}

        <Block position="relative" translate="20px -90px">
          <CaptureModal open={isReady} onClose={onReset} />
        </Block>
      </InlineBlock>
    </React.Fragment>
  )
}
